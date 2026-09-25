import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, In, type EntityManager } from 'typeorm'
import { OrderStatusCatalogService } from '../catalogs/order-status-catalog.service.js'
import type { Env } from '../config/env.schema.js'
import { newId } from '../database/id.js'
import { Product } from '../products/entities/product.entity.js'
import { OrderItem } from './entities/order-item.entity.js'
import { OrderPayment } from './entities/order-payment.entity.js'
import { OrderStatusHistory } from './entities/order-status-history.entity.js'
import { Order, type StockConflict, type StockConflictLine } from './entities/order.entity.js'
import {
    checkTransition,
    invalidTransitionMessage,
    type OrderActor,
    type OrderStatus,
    type RefundStatus,
} from './order-status.js'
import {
    ORDER_EVENTS,
    type OrderCreatedEvent,
    type OrderPaymentSubmittedEvent,
    type OrderRefundUpdatedEvent,
    type OrderStatusChangedEvent,
} from './orders.events.js'

export const ORDER_NOT_FOUND = 'No encontramos el pedido.'
/** 409 of a reactivation without enough stock (`lines` lists what is missing). */
export const STOCK_INSUFFICIENT = 'STOCK_INSUFFICIENT'
/** 400 when confirming a payment of an order with a stock conflict without acknowledging it. */
export const STOCK_CONFLICT_UNACKNOWLEDGED = 'STOCK_CONFLICT_UNACKNOWLEDGED'

/** Events collected inside a transaction and emitted once it commits. */
export type PendingOrderEvent =
    | { name: typeof ORDER_EVENTS.created; payload: OrderCreatedEvent }
    | { name: typeof ORDER_EVENTS.paymentSubmitted; payload: OrderPaymentSubmittedEvent }
    | { name: typeof ORDER_EVENTS.statusChanged; payload: OrderStatusChangedEvent }
    | { name: typeof ORDER_EVENTS.refundUpdated; payload: OrderRefundUpdatedEvent }

/** Everything a transition may need besides its target. */
export interface TransitionOptions {
    /** Reason (rejections, cancellations) or note (shipping). */
    note?: string | null
    /** Set by the payment recorders only: the order moves because a proof was just recorded. */
    paymentRecorded?: boolean
    /** The admin confirms a payment knowing the order lacks stock (required in that case). */
    acknowledgeStockConflict?: boolean
    /** Reactivate even without enough stock; what is missing is flagged as a stock conflict. */
    forceStock?: boolean
    /** Required when cancelling an order with a pending or verified payment. */
    refundStatus?: RefundStatus
    refundReference?: string | null
}

type ReserveResult =
    { ok: true; conflict: StockConflict | null } | { ok: false; lines: StockConflictLine[] }

export function actorUserId(actor: OrderActor): string | null {
    if (actor.kind === 'admin') return actor.userId
    if (actor.kind === 'telegram') return actor.userId ?? null
    return null
}

function badRequest(field: string, message: string, error: string, code?: string) {
    return new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        ...(code ? { code } : {}),
        message,
        details: [{ field, errors: [error] }],
    })
}

function units(count: number): string {
    return count === 1 ? '1 unidad' : `${count} unidades`
}

/** "«Taza X» pidió 3, hay 1" for each line. */
export function describeStockLines(lines: readonly StockConflictLine[]): string {
    return lines
        .map((line) => `«${line.productName}» pidió ${line.requested}, hay ${line.available}`)
        .join('; ')
}

/**
 * The one place where an order changes status. The admin HTTP API, the payment-proof upload,
 * the expiry job and the future Telegram bot all go through `transition()` (or, inside an
 * existing transaction, `applyTransition()`), so the allowed-transition map, the side effects
 * (stock, payment review, refunds) and the history/event trail can never diverge.
 */
@Injectable()
export class OrderStatusService {
    private readonly logger = new Logger(OrderStatusService.name)
    private readonly paymentWindowMs: number

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly events: EventEmitter2,
        private readonly catalog: OrderStatusCatalogService,
        config: ConfigService<Env, true>,
    ) {
        this.paymentWindowMs = config.get('ORDER_PAYMENT_WINDOW_HOURS', { infer: true }) * 3_600_000
    }

    /** Deadline of an order created (or reactivated) at `from`. */
    paymentDeadline(from: Date): Date {
        return new Date(from.getTime() + this.paymentWindowMs)
    }

    /**
     * Moves the order `code` to `to` on behalf of `actor`. Throws 404 (unknown order), 409
     * (transition not allowed from the current status, or not enough stock to reactivate), 403
     * (role may not do it) or 400 (a reason, the refund answer or the stock acknowledgement is
     * missing). Emits `order.status_changed` after commit. A plain string is the note.
     */
    async transition(
        code: string,
        to: OrderStatus,
        actor: OrderActor,
        options?: string | null | TransitionOptions,
    ): Promise<Order> {
        const normalized: TransitionOptions =
            typeof options === 'object' && options !== null ? options : { note: options ?? null }
        const pending: PendingOrderEvent[] = []
        const order = await this.dataSource.transaction(async (manager) => {
            const locked = await this.lockByCode(manager, code)
            if (!locked) throw new NotFoundException(ORDER_NOT_FOUND)
            await this.applyTransition(manager, locked, to, actor, normalized, pending)
            return locked
        })
        this.emit(pending)
        return order
    }

    /** Loads the order row with a `FOR UPDATE` lock (inside a transaction). */
    lockByCode(manager: EntityManager, code: string): Promise<Order | null> {
        return manager
            .createQueryBuilder(Order, 'o')
            .setLock('pessimistic_write')
            .where('o.code = :code', { code })
            .getOne()
    }

    /**
     * Validates and applies one transition inside the caller's transaction. `order` must have
     * been loaded with `lockByCode` in that same transaction; it is updated in place. Every
     * check runs before the first write.
     */
    async applyTransition(
        manager: EntityManager,
        order: Order,
        to: OrderStatus,
        actor: OrderActor,
        options: TransitionOptions,
        pending: PendingOrderEvent[],
    ): Promise<void> {
        const from = order.status
        const check = checkTransition(from, to, actor)
        if (!check.ok) {
            if (check.reason === 'forbidden') {
                throw new ForbiddenException('No tienes permisos para realizar esta acción.')
            }
            throw new ConflictException(
                invalidTransitionMessage(from, to, await this.catalog.labeler()),
            )
        }
        const { rule } = check
        const trimmedNote = options.note?.trim() || null
        if (rule.requiresReason && !trimmedNote) {
            throw badRequest(
                'note',
                'Escribe el motivo para continuar.',
                'El motivo es obligatorio.',
            )
        }
        if (rule.requiresPayment && !options.paymentRecorded) {
            throw new ConflictException(
                'Para pasar el pedido a verificación, registra el pago con sus datos.',
            )
        }
        if (rule.requiresNoVerifiedPayment) {
            const verified = await manager.find(OrderPayment, {
                where: { orderId: order.id, status: 'VERIFICADO' },
                select: { id: true },
            })
            if (verified.length) {
                throw new ConflictException(
                    'Este pedido tuvo un pago verificado, así que no se puede reactivar.',
                )
            }
        }
        const refund = to === 'CANCELADO' ? await this.refundAnswer(manager, order, options) : null
        const conflictToResolve =
            to === 'PAGO_VERIFICADO' && order.stockConflict && !order.stockConflict.resolvedAt
                ? order.stockConflict
                : null
        if (conflictToResolve && options.acknowledgeStockConflict !== true) {
            throw badRequest(
                'acknowledgeStockConflict',
                `Falta stock para este pedido (${describeStockLines(conflictToResolve.lines)}). Confirma que lo entiendes para continuar.`,
                'Confirma que entiendes que falta stock.',
                STOCK_CONFLICT_UNACKNOWLEDGED,
            )
        }

        const now = new Date()
        const reviewerId = actorUserId(actor)
        const changes: Partial<Order> = { status: to }
        const systemNotes: string[] = []

        // Strict reservation first: it is the only step that can still refuse (409).
        if (rule.reservesStock && order.stockRestored) {
            const reserved = await this.reserveStock(manager, order.id, now, {
                strict: rule.reactivates === true && options.forceStock !== true,
            })
            if (!reserved.ok) {
                throw new ConflictException({
                    statusCode: 409,
                    error: 'Conflict',
                    code: STOCK_INSUFFICIENT,
                    message: `No hay stock suficiente para reactivar el pedido: ${describeStockLines(reserved.lines)}.`,
                    lines: reserved.lines,
                })
            }
            changes.stockRestored = false
            changes.stockConflict = reserved.conflict
            if (reserved.conflict) {
                systemNotes.push(
                    `Stock insuficiente: ${describeStockLines(reserved.conflict.lines)}.`,
                )
            }
        }
        if (rule.reactivates) {
            changes.paymentDueAt = this.paymentDeadline(now)
            systemNotes.unshift('Pedido reactivado con un nuevo plazo de pago.')
        }

        if (to === 'PAGO_VERIFICADO') {
            await this.reviewPendingPayment(manager, order.id, {
                status: 'VERIFICADO',
                reviewedAt: now,
                reviewedById: reviewerId,
            })
        } else if (
            to === 'PAGO_RECHAZADO' ||
            (to === 'CANCELADO' && from === 'PENDIENTE_VERIFICACION')
        ) {
            await this.reviewPendingPayment(manager, order.id, {
                status: 'RECHAZADO',
                rejectionReason: trimmedNote,
                reviewedAt: now,
                reviewedById: reviewerId,
            })
        }

        if (conflictToResolve) {
            const resolved = await this.takeMissingStock(
                manager,
                conflictToResolve,
                now,
                reviewerId,
            )
            changes.stockConflict = resolved
            const missing = resolved.lines.filter((line) => line.reserved < line.requested)
            systemNotes.push(
                missing.length
                    ? `Pago confirmado con stock insuficiente: ${missing
                          .map(
                              (line) =>
                                  `«${line.productName}» faltan ${units(line.requested - line.reserved)}`,
                          )
                          .join('; ')}.`
                    : 'Pago confirmado; el stock que faltaba ya estaba disponible.',
            )
        }

        if (rule.restoresStock && !order.stockRestored) {
            await this.restoreStock(manager, order)
            changes.stockRestored = true
            // The order holds nothing now; a later reservation starts from scratch.
            changes.stockConflict = null
        }

        if (refund) Object.assign(changes, refund.changes(now, reviewerId))

        await manager.update(Order, { id: order.id }, changes)
        const historyNote = systemNotes.length
            ? [trimmedNote && !/[.!?]$/.test(trimmedNote) ? `${trimmedNote}.` : trimmedNote]
                  .concat(systemNotes)
                  .filter(Boolean)
                  .join(' ')
            : trimmedNote
        await manager.insert(OrderStatusHistory, {
            id: newId(),
            orderId: order.id,
            fromStatus: from,
            toStatus: to,
            actorType: actor.kind,
            actorUserId: reviewerId,
            note: historyNote,
            createdAt: now,
        })

        Object.assign(order, changes)
        pending.push({
            name: ORDER_EVENTS.statusChanged,
            payload: {
                orderId: order.id,
                code: order.code,
                from,
                to,
                actor: actor.kind,
                actorUserId: reviewerId,
                note: historyNote,
                changedAt: now.toISOString(),
            },
        })
        if (refund && order.refundStatus) {
            pending.push({
                name: ORDER_EVENTS.refundUpdated,
                payload: {
                    orderId: order.id,
                    code: order.code,
                    refundStatus: order.refundStatus,
                    reference: order.refundReference,
                    actorUserId: reviewerId,
                    updatedAt: now.toISOString(),
                },
            })
        }
    }

    /** Emits events collected during a committed transaction. A failing listener is logged. */
    emit(pending: readonly PendingOrderEvent[]): void {
        for (const event of pending) {
            try {
                this.events.emit(event.name, event.payload)
            } catch (error) {
                this.logger.error(`Listener of ${event.name} failed`, error as Error)
            }
        }
    }

    /**
     * Cancelling an order with a pending or verified payment must say whether money has to be
     * given back. Returns the columns to write (null when the order never had such a payment).
     */
    private async refundAnswer(
        manager: EntityManager,
        order: Order,
        options: TransitionOptions,
    ): Promise<{ changes: (now: Date, userId: string | null) => Partial<Order> } | null> {
        const live = await manager.find(OrderPayment, {
            where: { orderId: order.id, status: In(['PENDIENTE', 'VERIFICADO']) },
            select: { id: true },
        })
        if (!live.length) return null
        const status = options.refundStatus
        if (!status) {
            throw badRequest(
                'refundStatus',
                'Indica si hay que devolver dinero al cliente.',
                'Indica si hay que devolver dinero al cliente.',
            )
        }
        const reference = options.refundReference?.trim() || null
        return {
            changes: (now, userId) => ({
                refundStatus: status,
                refundReference: status === 'REEMBOLSADO' ? reference : null,
                refundedAt: status === 'REEMBOLSADO' ? now : null,
                refundedById: status === 'REEMBOLSADO' ? userId : null,
            }),
        }
    }

    private async reviewPendingPayment(
        manager: EntityManager,
        orderId: string,
        changes: Partial<OrderPayment>,
    ): Promise<void> {
        await manager.update(OrderPayment, { orderId, status: 'PENDIENTE' }, changes)
    }

    /** Locks the given products (`FOR UPDATE`, in id order, so concurrent orders never deadlock). */
    private async lockProducts(
        manager: EntityManager,
        ids: string[],
    ): Promise<Map<string, Product>> {
        if (!ids.length) return new Map()
        const products = await manager
            .createQueryBuilder(Product, 'product')
            .setLock('pessimistic_write')
            .where('product.id IN (:...ids)', { ids: [...ids].sort() })
            .orderBy('product.id', 'ASC')
            .getMany()
        return new Map(products.map((product) => [product.id, product]))
    }

    private async takeStock(manager: EntityManager, productId: string, quantity: number) {
        await manager.query(
            `UPDATE "products" SET "stock" = "stock" - $1 WHERE "id" = $2 AND "stock" >= $1`,
            [quantity, productId],
        )
    }

    /**
     * Takes the order's quantities out of stock again, with the same row locks as checkout.
     * `strict`: all or nothing (reactivation without force). Otherwise every product gives what
     * it has, never going below 0, and the shortfall is returned as a stock conflict.
     */
    private async reserveStock(
        manager: EntityManager,
        orderId: string,
        now: Date,
        { strict }: { strict: boolean },
    ): Promise<ReserveResult> {
        const items = await manager.find(OrderItem, {
            where: { orderId },
            select: { productId: true, productName: true, quantity: true, sortOrder: true },
        })
        const wanted = new Map<string, StockConflictLine>()
        for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
            // A deleted product cannot give stock back: it shows up as a conflict line.
            const key = item.productId ?? `deleted:${item.productName}`
            const line = wanted.get(key)
            if (line) line.requested += item.quantity
            else {
                wanted.set(key, {
                    productId: item.productId,
                    productName: item.productName,
                    requested: item.quantity,
                    available: 0,
                    reserved: 0,
                })
            }
        }
        const products = await this.lockProducts(
            manager,
            [...wanted.values()].flatMap((line) => (line.productId ? [line.productId] : [])),
        )
        const lines = [...wanted.values()].map((line) => {
            const product = line.productId ? products.get(line.productId) : undefined
            const available = product ? Math.max(0, product.stock) : 0
            return { ...line, available, reserved: Math.min(line.requested, available) }
        })
        const short = lines.filter((line) => line.available < line.requested)
        if (short.length && strict) return { ok: false, lines: short }

        for (const line of [...lines].sort((a, b) =>
            (a.productId ?? '').localeCompare(b.productId ?? ''),
        )) {
            if (line.productId && line.reserved > 0) {
                await this.takeStock(manager, line.productId, line.reserved)
            }
        }
        return {
            ok: true,
            conflict: short.length
                ? {
                      detectedAt: now.toISOString(),
                      lines: short,
                      resolvedAt: null,
                      resolvedById: null,
                  }
                : null,
        }
    }

    /** On confirmation: takes whatever of the missing stock is there now (never below 0). */
    private async takeMissingStock(
        manager: EntityManager,
        conflict: StockConflict,
        now: Date,
        userId: string | null,
    ): Promise<StockConflict> {
        const products = await this.lockProducts(
            manager,
            conflict.lines.flatMap((line) => (line.productId ? [line.productId] : [])),
        )
        const lines: StockConflictLine[] = []
        for (const line of conflict.lines) {
            const product = line.productId ? products.get(line.productId) : undefined
            const take = product
                ? Math.min(line.requested - line.reserved, Math.max(0, product.stock))
                : 0
            if (product && take > 0) await this.takeStock(manager, product.id, take)
            lines.push({ ...line, reserved: line.reserved + take })
        }
        return { ...conflict, lines, resolvedAt: now.toISOString(), resolvedById: userId }
    }

    /**
     * Puts back what the order holds: every line's quantity, except for the products of a stock
     * conflict, which only give back what was actually taken. Product ids sorted so concurrent
     * restores never deadlock.
     */
    private async restoreStock(manager: EntityManager, order: Order): Promise<void> {
        const items = await manager.find(OrderItem, {
            where: { orderId: order.id },
            select: { productId: true, quantity: true },
        })
        const byProduct = new Map<string, number>()
        for (const item of items) {
            if (!item.productId) continue
            byProduct.set(item.productId, (byProduct.get(item.productId) ?? 0) + item.quantity)
        }
        for (const line of order.stockConflict?.lines ?? []) {
            if (line.productId && byProduct.has(line.productId)) {
                byProduct.set(line.productId, line.reserved)
            }
        }
        for (const productId of [...byProduct.keys()].sort()) {
            const quantity = byProduct.get(productId) ?? 0
            if (quantity <= 0) continue
            await manager.query(`UPDATE "products" SET "stock" = "stock" + $1 WHERE "id" = $2`, [
                quantity,
                productId,
            ])
        }
    }
}
