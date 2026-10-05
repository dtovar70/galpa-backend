import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, In, type EntityManager } from 'typeorm'
import { BanksService } from '../catalogs/banks.service.js'
import { MobilePrefixesService } from '../catalogs/mobile-prefixes.service.js'
import { OrderStatusCatalogService } from '../catalogs/order-status-catalog.service.js'
import { PaymentMethodCatalogService } from '../catalogs/payment-method-catalog.service.js'
import { paysInBolivars, type PaymentMethod } from '../common/payment-methods.js'
import { addDays, caracasDay } from '../common/utils/caracas-date.js'
import { ContentService } from '../content/content.service.js'
import {
    configuredMethods,
    isMethodConfigured,
    type PaymentContent,
    type PublicSiteContent,
} from '../content/content.types.js'
import { newId } from '../database/id.js'
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service.js'
import type { ExchangeRate } from '../exchange-rate/entities/exchange-rate.entity.js'
import { ProductImage } from '../products/entities/product-image.entity.js'
import {
    changeStock,
    lockStock,
    stockItemName,
    stockUnitKey,
    type LockedStock,
} from '../products/product-stock.js'
import type { StockMode } from '../products/products.constants.js'
import { detectImageType } from '../storage/image-type.js'
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.service.js'
import type { CreateOrderDto, OrderItemInputDto } from './dto/create-order.dto.js'
import type { SubmitPaymentDto } from './dto/submit-payment.dto.js'
import { OrderItem } from './entities/order-item.entity.js'
import { OrderPayment } from './entities/order-payment.entity.js'
import { OrderStatusHistory } from './entities/order-status-history.entity.js'
import { Order } from './entities/order.entity.js'
import {
    canSubmitPayment,
    isLatePayment,
    toPublicOrder,
    type PublicOrderDto,
} from './order.mapper.js'
import {
    amountDifference,
    computeTotals,
    fromCents,
    unitPriceCents,
    type DeliveryMethod,
} from './order-pricing.js'
import { OrderAccessService } from './order-access.service.js'
import {
    checkoutRequestHash,
    IDEMPOTENCY_WINDOW_MS,
    idempotencyKeyReused,
    isIdempotencyKeyConflict,
} from './order-idempotency.js'
import { CLOSED_STATUSES, METHOD_SWITCH_STATUSES, type OrderActor } from './order-status.js'
import {
    ORDER_NOT_FOUND,
    OrderStatusService,
    type PendingOrderEvent,
} from './order-status.service.js'
import { ORDER_EVENTS } from './orders.events.js'

export const PAYMENT_METHOD_UNAVAILABLE = 'PAYMENT_METHOD_UNAVAILABLE'
export const ORDER_ITEMS_INVALID = 'ORDER_ITEMS_INVALID'
const INVALID_BODY_MESSAGE = 'Los datos enviados no son válidos. Revisa los campos marcados.'
export const METHOD_NOT_OFFERED = 'Este método de pago no está disponible. Elige otro.'

/** One problem with one cart line (returned so the storefront can mark and fix it). */
export interface OrderLineProblem {
    index: number
    productId: string
    variantId: string | null
    /**
     * Units this line can keep: what its variant (or product without variants) has left, minus
     * what earlier lines of the same variant take. 0 when the line cannot be bought.
     */
    available: number
    message: string
}

export interface CreatedOrderDto {
    code: string
    /** The only time the token is returned: the customer's link is `/pedido/<code>?t=<token>`. */
    accessToken: string
    order: PublicOrderDto
    /**
     * True when this is the answer to a retried checkout (same `Idempotency-Key` and body): no
     * new order was created and `accessToken` is a fresh link to the existing one.
     */
    replayed: boolean
}

/**
 * One line ready to be stored: prices are final (cents) and the product details are the
 * snapshot. `productId` null is a free-text line (quotes), which never touches stock.
 */
export interface PreparedOrderLine {
    productId: string | null
    variantId: string | null
    productName: string
    productSlug: string | null
    variantLabel: string | null
    brand: string | null
    model: string | null
    stockMode: StockMode
    imageUrl: string | null
    unitCents: number
    quantity: number
}

/** The customer and delivery details of a new order. */
export interface NewOrderDetails {
    customerName: string
    customerEmail: string
    customerPhone: string
    customerIdNumber: string | null
    city: string
    address: string
    deliveryMethod: DeliveryMethod
    notes: string
    paymentMethod: PaymentMethod
    wantsInstallation: boolean
}

/** A quote line to turn into an order line (see `createFromQuote`). */
export interface QuoteLineInput {
    productId: string | null
    variantId: string | null
    description: string
    brand: string | null
    model: string | null
    unitCents: number
    quantity: number
}

interface CheckoutIdempotency {
    key: string
    hash: string
}

interface LockedCatalog extends LockedStock {
    firstImage: Map<string, string>
}

/** Who created the order: the customer at checkout, or an admin converting a quote. */
type OrderCreator = { kind: 'customer' } | { kind: 'admin'; userId: string; note: string }

function units(count: number): string {
    return count === 1 ? '1 unidad' : `${count} unidades`
}

/** "Solo quedan 2 de «Split X – 220V»." / "«Split X – 220V» se agotó." */
function stockMessage(name: string, stock: number): string {
    if (stock <= 0) return `«${name}» se agotó.`
    const verb = stock === 1 ? 'Solo queda' : 'Solo quedan'
    return `${verb} ${units(stock)} de «${name}».`
}

function lineProblemsError(problems: OrderLineProblem[]): BadRequestException {
    return new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: ORDER_ITEMS_INVALID,
        message: 'Algunos productos de tu carrito cambiaron. Revisa los marcados.',
        details: problems.map((problem) => ({
            field: `items.${problem.index}`,
            errors: [problem.message],
        })),
        lines: problems,
    })
}

export function fieldError(field: string, message: string): BadRequestException {
    return new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: INVALID_BODY_MESSAGE,
        details: [{ field, errors: [message] }],
    })
}

function noPaymentMethods(): ServiceUnavailableException {
    return new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        code: PAYMENT_METHOD_UNAVAILABLE,
        message:
            'Por ahora no podemos recibir pedidos en línea. Escríbenos por WhatsApp y te ayudamos.',
    })
}

/**
 * Customer side of the orders: checkout (prices, shipping and the BCV rate are computed here,
 * never trusted from the client), the private order page, the payment method switch and the
 * payment proof upload. Also creates the orders converted from a quote.
 */
@Injectable()
export class OrdersService {
    private readonly logger = new Logger(OrdersService.name)

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly content: ContentService,
        private readonly rates: ExchangeRateService,
        private readonly statuses: OrderStatusService,
        private readonly catalog: OrderStatusCatalogService,
        private readonly methods: PaymentMethodCatalogService,
        private readonly banks: BanksService,
        private readonly mobilePrefixes: MobilePrefixesService,
        private readonly access: OrderAccessService,
        @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    ) {}

    /**
     * Checkout. With `idempotencyKey` (see order-idempotency.ts) a retry of the same request
     * returns the order created the first time instead of creating (and taking stock) again.
     */
    async create(dto: CreateOrderDto, idempotencyKey?: string): Promise<CreatedOrderDto> {
        const idempotency: CheckoutIdempotency | null = idempotencyKey
            ? { key: idempotencyKey, hash: checkoutRequestHash(dto) }
            : null
        // Before any other check: a retry must get its order even if, say, the rate went stale.
        if (idempotency) {
            const replayed = await this.replay(idempotency)
            if (replayed) return replayed
        }
        try {
            return await this.checkout(dto, idempotency)
        } catch (error) {
            // Two requests with the same key raced past the lookup: the second one's
            // transaction (and its stock) was rolled back; answer with the first one's order.
            if (idempotency && isIdempotencyKeyConflict(error)) {
                const replayed = await this.replay(idempotency)
                if (replayed) return replayed
            }
            throw error
        }
    }

    /**
     * The answer for a retried checkout: null when no order holds the key (or it is older than
     * the window, and is then freed); 409 when the key came with another body.
     */
    private async replay(idempotency: CheckoutIdempotency): Promise<CreatedOrderDto | null> {
        const orders = this.dataSource.getRepository(Order)
        const existing = await orders.findOne({
            where: { idempotencyKey: idempotency.key },
            select: { id: true, code: true, createdAt: true, idempotencyHash: true },
        })
        if (!existing) return null
        if (Date.now() - existing.createdAt.getTime() >= IDEMPOTENCY_WINDOW_MS) {
            await orders.update(
                { id: existing.id, idempotencyKey: idempotency.key },
                { idempotencyKey: null, idempotencyHash: null },
            )
            return null
        }
        if (existing.idempotencyHash !== idempotency.hash) throw idempotencyKeyReused()

        const { token } = await this.access.issue(existing.id, existing.code, null)
        const full = await this.loadFull(existing.id)
        this.logger.log(`Order ${existing.code} returned again for a retried checkout`)
        return {
            code: existing.code,
            accessToken: token,
            order: await this.toPublic(full, await this.paymentContent()),
            replayed: true,
        }
    }

    /**
     * 503 when the store offers no payment method at all (checkout is closed); 400 when the
     * chosen one is not offered.
     */
    private assertMethodOffered(payment: PaymentContent, method: PaymentMethod): void {
        if (!configuredMethods(payment).length) throw noPaymentMethods()
        if (!isMethodConfigured(payment, method))
            throw fieldError('paymentMethod', METHOD_NOT_OFFERED)
    }

    private async checkout(
        dto: CreateOrderDto,
        idempotency: CheckoutIdempotency | null,
    ): Promise<CreatedOrderDto> {
        // The DTO checked the shape ("0424-1234567"); the operator code must be active.
        const phoneProblem = await this.mobilePrefixes.phoneProblem(dto.phone)
        if (phoneProblem) throw fieldError('phone', phoneProblem)

        const content = await this.content.getAll()
        this.assertMethodOffered(content.payment, dto.paymentMethod)
        const rate = await this.rates.requireUsableRate()
        const pending: PendingOrderEvent[] = []

        const { order, token } = await this.dataSource.transaction(async (manager) => {
            const catalog = await this.lockCatalog(manager, dto.items)
            const lines = this.priceLines(dto.items, catalog)
            return this.insertOrder(
                manager,
                {
                    customerName: dto.fullName,
                    customerEmail: dto.email,
                    customerPhone: dto.phone,
                    customerIdNumber: dto.customerIdNumber ?? null,
                    city: dto.city,
                    address: dto.address,
                    deliveryMethod: dto.deliveryMethod,
                    notes: dto.notes ?? '',
                    paymentMethod: dto.paymentMethod,
                    wantsInstallation: dto.wantsInstallation ?? false,
                },
                lines,
                { content, rate, discountCents: 0, idempotency, creator: { kind: 'customer' } },
                pending,
            )
        })

        this.statuses.emit(pending)
        this.logger.log(`Order ${order.code} created (${order.totalUsd} USD)`)
        return {
            code: order.code,
            accessToken: token,
            order: await this.toPublic(order, content.payment),
            replayed: false,
        }
    }

    /**
     * An order made by an admin from a quote's lines, at the prices of the quote and the current
     * BCV rate. STOCK lines take their stock (409 when there is not enough); ON_ORDER and
     * free-text lines never do. `inTransaction` runs inside the same transaction (the quote marks
     * itself as converted), so both commit or fail together.
     */
    async createFromQuote(
        details: NewOrderDetails,
        quoteLines: readonly QuoteLineInput[],
        discountCents: number,
        userId: string,
        note: string,
        inTransaction: (manager: EntityManager, order: Order) => Promise<void>,
    ): Promise<{ code: string; customerUrl: string }> {
        const content = await this.content.getAll()
        this.assertMethodOffered(content.payment, details.paymentMethod)
        const rate = await this.rates.requireUsableRate()
        const pending: PendingOrderEvent[] = []

        const { order, token } = await this.dataSource.transaction(async (manager) => {
            const productIds = quoteLines.flatMap((line) =>
                line.productId ? [line.productId] : [],
            )
            const catalog = await this.lockCatalogByIds(manager, productIds)
            const lines = this.quoteOrderLines(quoteLines, catalog)
            const created = await this.insertOrder(
                manager,
                details,
                lines,
                {
                    content,
                    rate,
                    discountCents,
                    idempotency: null,
                    creator: { kind: 'admin', userId, note },
                },
                pending,
            )
            await inTransaction(manager, created.order)
            return created
        })

        this.statuses.emit(pending)
        this.logger.log(`Order ${order.code} created from a quote (${order.totalUsd} USD)`)
        return { code: order.code, customerUrl: this.access.customerUrl(order.code, token) }
    }

    /**
     * Writes a new PENDIENTE_PAGO order with its lines, its first private link and its history,
     * taking the stock of its STOCK lines (already locked and checked by the caller).
     */
    private async insertOrder(
        manager: EntityManager,
        details: NewOrderDetails,
        lines: readonly PreparedOrderLine[],
        context: {
            content: PublicSiteContent
            rate: ExchangeRate
            discountCents: number
            idempotency: CheckoutIdempotency | null
            creator: OrderCreator
        },
        pending: PendingOrderEvent[],
    ): Promise<{ order: Order; token: string }> {
        const { content, rate, idempotency, creator } = context
        const totals = computeTotals(
            lines.map((line) => ({ unitCents: line.unitCents, quantity: line.quantity })),
            details.deliveryMethod,
            content.shipping,
            rate.rate,
            context.discountCents,
        )

        await changeStock(
            manager,
            'take',
            lines.flatMap((line) =>
                line.productId && line.stockMode === 'STOCK'
                    ? [
                          {
                              productId: line.productId,
                              variantId: line.variantId,
                              quantity: line.quantity,
                          },
                      ]
                    : [],
            ),
        )

        const [{ seq }] = (await manager.query(
            `SELECT nextval('order_code_seq')::int AS "seq"`,
        )) as [{ seq: number }]
        const now = new Date()
        const created: Order = manager.create(Order, {
            id: newId(),
            code: `GP-${String(seq).padStart(6, '0')}`,
            status: 'PENDIENTE_PAGO',
            customerName: details.customerName,
            customerEmail: details.customerEmail.toLowerCase(),
            customerPhone: details.customerPhone,
            customerIdNumber: details.customerIdNumber,
            city: details.city,
            address: details.address,
            deliveryMethod: details.deliveryMethod,
            notes: details.notes,
            paymentMethod: details.paymentMethod,
            hasOnOrderItems: lines.some((line) => line.productId && line.stockMode === 'ON_ORDER'),
            wantsInstallation: details.wantsInstallation,
            ...totals,
            exchangeRate: rate.rate,
            exchangeRateSource: rate.source,
            exchangeRateDate: rate.effectiveDate,
            exchangeRateId: rate.id,
            paymentDueAt: this.statuses.paymentDeadline(now),
            stockRestored: false,
            latePayment: false,
            stockConflict: null,
            refundStatus: null,
            refundReference: null,
            refundedAt: null,
            refundedById: null,
            idempotencyKey: idempotency?.key ?? null,
            idempotencyHash: idempotency?.hash ?? null,
            createdAt: now,
            updatedAt: now,
        })
        await manager.insert(Order, created)
        // The customer's first private link (only its hash is stored).
        const { token } = await this.access.issue(created.id, created.code, null, manager)

        created.items = lines.map((line, index) =>
            manager.create(OrderItem, {
                id: newId(),
                orderId: created.id,
                productId: line.productId,
                variantId: line.variantId,
                productName: line.productName,
                productSlug: line.productSlug,
                variantLabel: line.variantLabel,
                brand: line.brand,
                model: line.model,
                stockMode: line.stockMode,
                imageUrl: line.imageUrl,
                unitPriceUsd: fromCents(line.unitCents),
                quantity: line.quantity,
                lineTotalUsd: fromCents(line.unitCents * line.quantity),
                sortOrder: index,
            }),
        )
        await manager.insert(OrderItem, created.items)

        const entry = manager.create(OrderStatusHistory, {
            id: newId(),
            orderId: created.id,
            fromStatus: null,
            toStatus: 'PENDIENTE_PAGO',
            actorType: creator.kind,
            actorUserId: creator.kind === 'admin' ? creator.userId : null,
            note: creator.kind === 'admin' ? creator.note : null,
            createdAt: now,
        })
        await manager.insert(OrderStatusHistory, entry)
        created.history = [entry]
        created.payments = []

        pending.push({
            name: ORDER_EVENTS.created,
            payload: {
                orderId: created.id,
                code: created.code,
                customerName: created.customerName,
                customerPhone: created.customerPhone,
                totalUsd: created.totalUsd,
                totalBs: created.totalBs,
                exchangeRate: created.exchangeRate,
                paymentMethod: created.paymentMethod,
                hasOnOrderItems: created.hasOnOrderItems,
                wantsInstallation: created.wantsInstallation,
                itemCount: lines.reduce((sum, line) => sum + line.quantity, 0),
                paymentDueAt: created.paymentDueAt.toISOString(),
                createdAt: now.toISOString(),
            },
        })
        return { order: created, token }
    }

    /** The customer's view of an order, with the catalog's status and payment method names. */
    private async toPublic(order: Order, payment: PaymentContent): Promise<PublicOrderDto> {
        const [label, methodLabel] = await Promise.all([
            this.catalog.labeler(),
            this.methods.labeler(),
        ])
        return toPublicOrder(order, payment, label, methodLabel)
    }

    /** The customer's order page. A wrong or missing token is a plain 404. */
    async getForCustomer(code: string, token: string | undefined): Promise<PublicOrderDto> {
        const order = await this.findAuthorized(code, token)
        const full = await this.loadFull(order.id)
        return this.toPublic(full, await this.paymentContent())
    }

    /**
     * `PATCH /orders/:code/payment-method`: the customer pays another way. Only while the order
     * waits for a payment (PENDIENTE_PAGO or PAGO_RECHAZADO), and only to an offered method.
     */
    async changePaymentMethod(
        code: string,
        token: string | undefined,
        method: PaymentMethod,
    ): Promise<PublicOrderDto> {
        const order = await this.findAuthorized(code, token)
        const payment = await this.paymentContent()
        if (!isMethodConfigured(payment, method)) throw fieldError('method', METHOD_NOT_OFFERED)

        await this.dataSource.transaction(async (manager) => {
            const locked = await this.statuses.lockByCode(manager, order.code)
            if (!locked) throw new NotFoundException(ORDER_NOT_FOUND)
            if (!METHOD_SWITCH_STATUSES.includes(locked.status)) {
                throw new ConflictException(
                    'El método de pago solo se puede cambiar mientras el pedido espera tu pago.',
                )
            }
            if (locked.paymentMethod !== method) {
                await manager.update(Order, { id: locked.id }, { paymentMethod: method })
                this.logger.log(
                    `Order ${locked.code}: payment method ${locked.paymentMethod} -> ${method}`,
                )
            }
        })
        return this.getForCustomer(code, token)
    }

    async submitPayment(
        code: string,
        token: string | undefined,
        dto: SubmitPaymentDto,
        file: Express.Multer.File | undefined,
    ): Promise<PublicOrderDto> {
        const order = await this.findAuthorized(code, token)
        // Customers may only pay with an offered method (an admin may record any).
        if (!isMethodConfigured(await this.paymentContent(), dto.method)) {
            throw fieldError('method', METHOD_NOT_OFFERED)
        }
        await this.recordPayment(order.code, dto, file, { kind: 'customer' })
        return this.getForCustomer(code, token)
    }

    /**
     * Records one payment proof and moves the order to PENDIENTE_VERIFICACION. Used by the
     * customer's page and by an admin who got the proof by WhatsApp (`actor.kind === 'admin'`).
     * The proof's method becomes the order's method. A real payment is never refused for being
     * late: it is accepted, and flagged `late` when its payment date is after the deadline's day;
     * an expired order takes its stock back (what is missing becomes a stock conflict for the
     * admin to resolve).
     */
    async recordPayment(
        code: string,
        dto: SubmitPaymentDto,
        file: Express.Multer.File | undefined,
        actor: Extract<OrderActor, { kind: 'customer' | 'admin' }>,
    ): Promise<void> {
        const order = await this.dataSource.getRepository(Order).findOne({ where: { code } })
        if (!order) throw new NotFoundException(ORDER_NOT_FOUND)
        this.assertPayable(order)

        const today = caracasDay()
        const earliest = addDays(caracasDay(order.createdAt), -1)
        if (dto.paidOn > today) {
            throw fieldError('paidOn', 'La fecha del pago no puede estar en el futuro.')
        }
        if (dto.paidOn < earliest) {
            throw fieldError('paidOn', 'La fecha del pago es anterior a la creación del pedido.')
        }
        const inBolivars = paysInBolivars(dto.method)
        let bankName: string | null = null
        if (inBolivars) {
            // Only active banks of the catalog; the name is kept as a snapshot on the payment.
            const bank = await this.banks.findActive(dto.payerBankCode ?? '')
            if (!bank) throw fieldError('payerBankCode', 'Elige el banco desde el que pagaste.')
            bankName = bank.name
        }
        if (dto.method === 'PAGO_MOVIL') {
            const phoneProblem = await this.mobilePrefixes.phoneProblem(dto.payerPhone ?? '')
            if (phoneProblem) throw fieldError('payerPhone', phoneProblem)
        }

        const methodName = (await this.methods.labeler())(dto.method)
        const proofKey = await this.storeProof(order.code, file)
        const pending: PendingOrderEvent[] = []
        try {
            await this.dataSource.transaction(async (manager) => {
                const locked = await this.statuses.lockByCode(manager, order.code)
                if (!locked) throw new NotFoundException(ORDER_NOT_FOUND)
                this.assertPayable(locked)

                const duplicateIds = await this.findDuplicateReferences(
                    manager,
                    locked.id,
                    dto.method,
                    dto.reference,
                )
                if (duplicateIds.length) {
                    await manager.update(
                        OrderPayment,
                        { id: In(duplicateIds) },
                        { duplicateReference: true },
                    )
                }

                const now = new Date()
                const late = isLatePayment(locked, dto.paidOn)
                const payment = manager.create(OrderPayment, {
                    id: newId(),
                    orderId: locked.id,
                    status: 'PENDIENTE',
                    method: dto.method,
                    reference: dto.reference,
                    payerBankCode: inBolivars ? (dto.payerBankCode ?? null) : null,
                    payerBankName: bankName,
                    payerPhone: dto.method === 'PAGO_MOVIL' ? (dto.payerPhone ?? null) : null,
                    payerIdNumber: inBolivars ? (dto.payerIdNumber ?? null) : null,
                    payerName: dto.method === 'ZELLE' ? (dto.payerName ?? null) : null,
                    payerAccount: inBolivars ? null : (dto.payerAccount ?? null),
                    paidOn: dto.paidOn,
                    amountBs: inBolivars ? (dto.amountBs ?? null) : null,
                    expectedBs: inBolivars ? locked.totalBs : null,
                    amountUsd: inBolivars ? null : (dto.amountUsd ?? null),
                    expectedUsd: inBolivars ? null : locked.totalUsd,
                    duplicateReference: duplicateIds.length > 0,
                    proofKey,
                    hasProof: proofKey !== null,
                    late,
                    source: actor.kind,
                    recordedById: actor.kind === 'admin' ? actor.userId : null,
                    rejectionReason: null,
                    reviewedAt: null,
                    reviewedById: null,
                    createdAt: now,
                })
                await manager.insert(OrderPayment, payment)
                const orderChanges: Partial<Order> = {}
                if (late && !locked.latePayment) orderChanges.latePayment = true
                if (locked.paymentMethod !== dto.method) orderChanges.paymentMethod = dto.method
                if (Object.keys(orderChanges).length) {
                    await manager.update(Order, { id: locked.id }, orderChanges)
                    Object.assign(locked, orderChanges)
                }

                const transitionEvents: PendingOrderEvent[] = []
                await this.statuses.applyTransition(
                    manager,
                    locked,
                    'PENDIENTE_VERIFICACION',
                    actor,
                    {
                        paymentRecorded: true,
                        note: [
                            actor.kind === 'admin'
                                ? `Pago por ${methodName} registrado por la administración (comprobante recibido por WhatsApp).`
                                : null,
                            late ? 'Pago hecho después del plazo, según la fecha indicada.' : null,
                        ]
                            .filter(Boolean)
                            .join(' '),
                    },
                    transitionEvents,
                )

                const amount = (inBolivars ? payment.amountBs : payment.amountUsd) ?? 0
                const expected = (inBolivars ? payment.expectedBs : payment.expectedUsd) ?? 0
                pending.push(
                    {
                        name: ORDER_EVENTS.paymentSubmitted,
                        payload: {
                            orderId: locked.id,
                            code: locked.code,
                            paymentId: payment.id,
                            method: payment.method,
                            currency: inBolivars ? 'VES' : 'USD',
                            reference: payment.reference,
                            payerBankCode: payment.payerBankCode,
                            payerBankName: payment.payerBankName,
                            payerName: payment.payerName,
                            payerAccount: payment.payerAccount,
                            amount,
                            expected,
                            amountDifference: amountDifference(amount, expected),
                            duplicateReference: payment.duplicateReference,
                            hasProof: payment.hasProof,
                            late,
                            source: payment.source,
                            stockConflict: Boolean(
                                locked.stockConflict && !locked.stockConflict.resolvedAt,
                            ),
                            submittedAt: payment.createdAt.toISOString(),
                        },
                    },
                    ...transitionEvents,
                )
            })
        } catch (error) {
            if (proofKey) {
                await this.storage.deletePrivate(proofKey).catch((cleanupError: unknown) => {
                    this.logger.warn(
                        `Could not delete orphan proof ${proofKey}: ${String(cleanupError)}`,
                    )
                })
            }
            throw error
        }

        this.statuses.emit(pending)
    }

    /** Stores the optional screenshot privately; null without one. */
    private async storeProof(
        code: string,
        file: Express.Multer.File | undefined,
    ): Promise<string | null> {
        if (!file) return null
        const type = detectImageType(file.buffer)
        if (!type) throw fieldError('proof', 'La captura debe ser una imagen JPG, PNG o WEBP.')
        try {
            return (
                await this.storage.uploadPrivate({ buffer: file.buffer, type }, 'payment-proofs')
            ).key
        } catch (error) {
            this.logger.error(`Proof upload failed for ${code}`, error as Error)
            throw new BadRequestException(
                'No pudimos guardar la captura. Intenta de nuevo o envía solo la referencia.',
            )
        }
    }

    /** 404 unless the code exists and the token opens one of its links. */
    private findAuthorized(code: string, token: string | undefined): Promise<Order> {
        return this.access.findAuthorized(code, token)
    }

    private assertPayable(order: Order): void {
        if (canSubmitPayment(order)) return
        if (order.status === 'PENDIENTE_VERIFICACION') {
            throw new ConflictException(
                'Ya recibimos un pago para este pedido y lo estamos verificando.',
            )
        }
        if (order.status === 'CANCELADO') {
            throw new ConflictException(
                'Este pedido fue cancelado. Si hiciste un pago, escríbenos por WhatsApp.',
            )
        }
        throw new ConflictException('Este pedido ya no admite pagos.')
    }

    private async loadFull(orderId: string): Promise<Order> {
        const order = await this.dataSource.getRepository(Order).findOne({
            where: { id: orderId },
            relations: { items: true, payments: true, history: true },
        })
        if (!order) throw new NotFoundException(ORDER_NOT_FOUND)
        return order
    }

    private async paymentContent(): Promise<PaymentContent> {
        return (await this.content.getAll()).payment
    }

    /**
     * Other payments with the same method and reference on orders that are still alive. A match
     * only flags the payments for the admin, it never refuses one.
     */
    private async findDuplicateReferences(
        manager: EntityManager,
        orderId: string,
        method: PaymentMethod,
        reference: string,
    ): Promise<string[]> {
        const rows = (await manager.query(
            `SELECT p."id" FROM "order_payments" p
             JOIN "orders" o ON o."id" = p."order_id"
             WHERE p."method" = $1 AND p."reference" = $2 AND p."order_id" <> $3
               AND o."status" <> ALL($4)`,
            [method, reference, orderId, CLOSED_STATUSES],
        )) as { id: string }[]
        return rows.map((row) => row.id)
    }

    /** Locks the ordered products and their variants (see `lockStock`) and reads photos. */
    private lockCatalog(
        manager: EntityManager,
        items: readonly OrderItemInputDto[],
    ): Promise<LockedCatalog> {
        return this.lockCatalogByIds(
            manager,
            items.map((item) => item.productId),
        )
    }

    private async lockCatalogByIds(
        manager: EntityManager,
        productIds: readonly string[],
    ): Promise<LockedCatalog> {
        const ids = [...new Set(productIds)].sort()
        const locked = await lockStock(manager, ids)
        const images = ids.length
            ? await manager.find(ProductImage, {
                  where: { productId: In(ids) },
                  order: { sortOrder: 'ASC', createdAt: 'ASC' },
                  select: {
                      productId: true,
                      url: true,
                      sortOrder: true,
                      createdAt: true,
                      id: true,
                  },
              })
            : []

        const firstImage = new Map<string, string>()
        for (const image of images) {
            if (!firstImage.has(image.productId)) firstImage.set(image.productId, image.url)
        }
        return { ...locked, firstImage }
    }

    /**
     * Server-side prices for every line; throws 400 with one message per bad line. The stock
     * of STOCK products is checked per variant (or per product without variants), adding up
     * every cart line of that variant: earlier lines keep their units first, and each short line
     * reports what it can keep (`available`). ON_ORDER products have no stock limit.
     */
    private priceLines(
        items: readonly OrderItemInputDto[],
        catalog: LockedCatalog,
    ): PreparedOrderLine[] {
        const problems: OrderLineProblem[] = []
        /** Units still free per stock unit while walking the cart in order. */
        const remaining = new Map<string, number>()
        const lines = items.map((item, index): PreparedOrderLine | null => {
            const product = catalog.products.get(item.productId)
            const problem = (message: string, available = 0) =>
                problems.push({
                    index,
                    productId: item.productId,
                    variantId: item.variantId ?? null,
                    available,
                    message,
                })

            if (!product || !product.isActive) {
                problem(
                    product
                        ? `«${product.name}» ya no está disponible.`
                        : 'Este producto ya no está disponible.',
                )
                return null
            }
            const variants = catalog.variants.get(product.id) ?? []
            const variant = item.variantId
                ? variants.find((candidate) => candidate.id === item.variantId)
                : undefined
            if (item.variantId && !variant) {
                problem(`La opción elegida de «${product.name}» ya no existe. Elígela de nuevo.`)
                return null
            }
            if (!item.variantId && variants.length > 0) {
                problem(`Elige una opción de «${product.name}».`)
                return null
            }

            if (product.stockMode === 'STOCK') {
                const key = stockUnitKey(product.id, variant?.id ?? null)
                const stock = Math.max(0, variant ? variant.stock : product.stock)
                const left = remaining.get(key) ?? stock
                const keeps = Math.min(item.quantity, left)
                remaining.set(key, left - keeps)
                if (keeps < item.quantity) {
                    problem(stockMessage(stockItemName(product.name, variant?.label), stock), keeps)
                    return null
                }
            }
            return {
                productId: product.id,
                variantId: variant?.id ?? null,
                productName: product.name,
                productSlug: product.slug,
                variantLabel: variant?.label ?? null,
                brand: product.brand,
                model: product.model,
                stockMode: product.stockMode,
                imageUrl: catalog.firstImage.get(product.id) ?? null,
                unitCents: unitPriceCents(product.price, variant?.priceDelta ?? 0),
                quantity: item.quantity,
            }
        })

        if (problems.length) throw lineProblemsError(problems)
        return lines.filter((line): line is PreparedOrderLine => line !== null)
    }

    /**
     * Order lines from a quote's lines (prices of the quote). A product line keeps the product's
     * current details as its snapshot; a STOCK product must have the units (409 listing what
     * is missing) and, when it has variants, the line must name one. Free-text lines (and lines
     * of a deleted product) are stored without product, as ON_ORDER, so they never touch stock.
     */
    private quoteOrderLines(
        quoteLines: readonly QuoteLineInput[],
        catalog: LockedCatalog,
    ): PreparedOrderLine[] {
        const problems: string[] = []
        const remaining = new Map<string, number>()
        const lines = quoteLines.map((line): PreparedOrderLine => {
            const product = line.productId ? catalog.products.get(line.productId) : undefined
            const freeLine: PreparedOrderLine = {
                productId: null,
                variantId: null,
                productName: line.description,
                productSlug: null,
                variantLabel: null,
                brand: line.brand,
                model: line.model,
                stockMode: 'ON_ORDER',
                imageUrl: null,
                unitCents: line.unitCents,
                quantity: line.quantity,
            }
            if (!product) return freeLine

            const variants = catalog.variants.get(product.id) ?? []
            const variant = line.variantId
                ? variants.find((candidate) => candidate.id === line.variantId)
                : undefined
            if (variants.length && !variant) {
                problems.push(`Elige la opción de «${product.name}» en la cotización.`)
            } else if (product.stockMode === 'STOCK') {
                const key = stockUnitKey(product.id, variant?.id ?? null)
                const stock = Math.max(0, variant ? variant.stock : product.stock)
                const left = remaining.get(key) ?? stock
                remaining.set(key, Math.max(0, left - line.quantity))
                if (left < line.quantity) {
                    problems.push(stockMessage(stockItemName(product.name, variant?.label), stock))
                }
            }
            return {
                ...freeLine,
                productId: product.id,
                variantId: variant?.id ?? null,
                productSlug: product.slug,
                variantLabel: variant?.label ?? null,
                brand: line.brand ?? product.brand,
                model: line.model ?? product.model,
                stockMode: product.stockMode,
                imageUrl: catalog.firstImage.get(product.id) ?? null,
            }
        })
        if (problems.length) {
            throw new ConflictException(`No se puede crear el pedido: ${problems.join(' ')}`.trim())
        }
        return lines
    }
}
