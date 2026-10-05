import {
    PAYMENT_METHOD_CURRENCY,
    paysInBolivars,
    type PaymentCurrency,
    type PaymentMethod,
} from '../common/payment-methods.js'
import { caracasDay } from '../common/utils/caracas-date.js'
import { DEFAULT_SITE_CONTENT } from '../content/content.defaults.js'
import {
    configuredMethods,
    isMethodConfigured,
    type PaymentContent,
} from '../content/content.types.js'
import type { StockMode } from '../products/products.constants.js'
import { RATE_SOURCE_LABELS, type RateSource } from '../exchange-rate/providers/rate-provider.js'
import type { OrderItem } from './entities/order-item.entity.js'
import type { OrderNote } from './entities/order-note.entity.js'
import type { OrderPayment, PaymentSource, PaymentStatus } from './entities/order-payment.entity.js'
import type { OrderStatusHistory } from './entities/order-status-history.entity.js'
import type { Order } from './entities/order.entity.js'
import { amountDifference, type DeliveryMethod } from './order-pricing.js'
import { hasReceipt } from './receipt/receipt-availability.js'
import type { LiveStockConflict } from './stock-conflict.js'
import type { StatusLabeler } from '../catalogs/order-status-catalog.service.js'
import type { PaymentMethodLabeler } from '../catalogs/payment-method-catalog.service.js'
import {
    METHOD_SWITCH_STATUSES,
    PAYABLE_STATUSES,
    REFUND_STATUS_LABELS,
    type ActorKind,
    type OrderStatus,
    type RefundStatus,
    type TransitionRule,
} from './order-status.js'

export interface OrderCustomerDto {
    fullName: string
    email: string
    phone: string
    /** Cédula or RIF; null when not given. */
    idNumber: string | null
    city: string
    address: string
    deliveryMethod: DeliveryMethod
    notes: string
}

export interface OrderItemDto {
    /** Null for a free-text line (from a quote) or a deleted product. */
    productId: string | null
    productName: string
    productSlug: string | null
    variantId: string | null
    variantLabel: string | null
    brand: string | null
    model: string | null
    stockMode: StockMode
    imageUrl: string | null
    unitPriceUsd: number
    quantity: number
    lineTotalUsd: number
}

export interface AdminOrderItemDto extends OrderItemDto {
    id: string
}

export interface OrderTotalsDto {
    subtotalUsd: number
    /** Discount of a quote converted into the order (0 otherwise). */
    discountUsd: number
    shippingUsd: number
    totalUsd: number
    totalBs: number
    exchangeRate: number
    exchangeRateDate: string
    exchangeRateSource: RateSource
    exchangeRateSourceLabel: string
}

/** A payment proof, as the customer and the admin see it (null where it does not apply). */
export interface PublicPaymentDto {
    id: string
    method: PaymentMethod
    reference: string
    payerBankCode: string | null
    payerBankName: string | null
    payerPhone: string | null
    payerIdNumber: string | null
    payerName: string | null
    payerAccount: string | null
    paidOn: string
    amountBs: number | null
    amountUsd: number | null
    expectedBs: number | null
    expectedUsd: number | null
    status: PaymentStatus
    hasProof: boolean
    /** Recorded after the deadline or while the order was expired. */
    late: boolean
    duplicateReference: boolean
    /** `admin`: recorded by an admin from a proof the customer sent by WhatsApp. */
    source: PaymentSource
    rejectionReason: string | null
    createdAt: string
    reviewedAt: string | null
}

export interface OrderHistoryEntryDto {
    status: OrderStatus
    label: string
    at: string
    /** Only for customer-facing notes: rejection/cancellation reasons and shipping details. */
    note: string | null
}

/** The amount to pay with the order's method: `totalBs` in VES or `totalUsd` in USD. */
export interface AmountDueDto {
    currency: PaymentCurrency
    amount: number
}

/** What the customer sees at `/pedido/:code?t=`. */
export interface PublicOrderDto {
    code: string
    status: OrderStatus
    statusLabel: string
    createdAt: string
    paymentDueAt: string
    /** The customer may send a payment proof now. */
    canSubmitPayment: boolean
    /** The customer may still switch the payment method (`PATCH .../payment-method`). */
    canChangePaymentMethod: boolean
    /** The purchase receipt PDF can be downloaded (verified payment, not cancelled). */
    receiptAvailable: boolean
    paymentMethod: PaymentMethod
    paymentMethodLabel: string
    amountDue: AmountDueDto
    /** Some line is sold "bajo pedido". */
    hasOnOrderItems: boolean
    wantsInstallation: boolean
    customer: OrderCustomerDto
    items: OrderItemDto[]
    totals: OrderTotalsDto
    /**
     * Where to pay: the store's payment section, where only the methods offered now keep their
     * details (the rest come back disabled and empty).
     */
    payment: PaymentContent
    /** The methods offered now, in display order. */
    availablePaymentMethods: PaymentMethod[]
    payments: PublicPaymentDto[]
    history: OrderHistoryEntryDto[]
}

export interface PaymentFlagsDto {
    duplicateReference: boolean
    /** VES for bolívar methods, USD for Zelle and Binance. */
    currency: PaymentCurrency
    amountMismatch: boolean
    /** Paid minus expected, in `currency`; 0 when exact. */
    amountDifference: number
}

export interface AdminPaymentDto extends PublicPaymentDto, PaymentFlagsDto {
    methodLabel: string
    recordedBy: { id: string; name: string } | null
    /** API path of the screenshot (authenticated); null when none was sent. */
    proofPath: string | null
    reviewedBy: { id: string; name: string } | null
}

export interface AdminHistoryEntryDto {
    from: OrderStatus | null
    to: OrderStatus
    label: string
    actor: ActorKind
    actorName: string
    note: string | null
    at: string
}

export interface AdminNoteDto {
    id: string
    body: string
    author: { id: string; name: string } | null
    createdAt: string
}

export interface AllowedTransitionDto {
    to: OrderStatus
    label: string
    requiresReason: boolean
    restoresStock: boolean
    /** Reached by recording a payment ("Registrar pago manualmente"), not by a plain button. */
    requiresPayment: boolean
    /** Reopens the order with a fresh deadline ("Reactivar pedido"); may lack stock. */
    reactivates: boolean
}

export interface RefundDto {
    status: RefundStatus
    label: string
    reference: string | null
    refundedAt: string | null
    refundedBy: { id: string; name: string } | null
}

export interface AdminOrderDto {
    id: string
    code: string
    status: OrderStatus
    statusLabel: string
    createdAt: string
    updatedAt: string
    paymentDueAt: string
    stockRestored: boolean
    /** Some payment proof arrived after the deadline (or once the order had expired). */
    latePayment: boolean
    /**
     * Products the order could not take back from stock; `resolvedAt` once acknowledged. While
     * open, `available` is the stock there is now and `stillShort` says whether confirming the
     * payment still needs an acknowledgement (otherwise the missing units are taken then).
     */
    stockConflict: LiveStockConflict | null
    /** Asked when an order with a payment was cancelled; null otherwise. */
    refund: RefundDto | null
    /** The purchase receipt PDF can be downloaded (verified payment, not cancelled). */
    receiptAvailable: boolean
    paymentMethod: PaymentMethod
    paymentMethodLabel: string
    amountDue: AmountDueDto
    hasOnOrderItems: boolean
    wantsInstallation: boolean
    customer: OrderCustomerDto
    items: AdminOrderItemDto[]
    totals: OrderTotalsDto
    payments: AdminPaymentDto[]
    history: AdminHistoryEntryDto[]
    notes: AdminNoteDto[]
    allowedTransitions: AllowedTransitionDto[]
}

export interface AdminOrderListItemDto {
    code: string
    status: OrderStatus
    statusLabel: string
    createdAt: string
    paymentDueAt: string
    customerName: string
    customerPhone: string
    deliveryMethod: DeliveryMethod
    paymentMethod: PaymentMethod
    hasOnOrderItems: boolean
    wantsInstallation: boolean
    totalUsd: number
    totalBs: number
    itemCount: number
    latePayment: boolean
    /** An unresolved stock conflict still short now (confirming the payment needs an acknowledgement). */
    stockConflict: boolean
    refundStatus: RefundStatus | null
    /** The newest payment proof, if any. */
    latestPayment:
        | (PaymentFlagsDto & {
              method: PaymentMethod
              reference: string
              amount: number | null
              status: PaymentStatus
          })
        | null
}

/** History notes the customer may read (the rest may be internal wording). */
const PUBLIC_NOTE_STATUSES: readonly OrderStatus[] = ['PAGO_RECHAZADO', 'CANCELADO', 'DESPACHADO']

const ACTOR_NAMES: Record<ActorKind, string> = {
    admin: 'Administración',
    customer: 'Cliente',
    system: 'Sistema',
    telegram: 'Telegram',
}

/** What was paid and what was expected, in the method's currency. */
export function paymentAmounts(
    payment: Pick<OrderPayment, 'method' | 'amountBs' | 'expectedBs' | 'amountUsd' | 'expectedUsd'>,
): { currency: PaymentCurrency; amount: number | null; expected: number | null } {
    return paysInBolivars(payment.method)
        ? { currency: 'VES', amount: payment.amountBs, expected: payment.expectedBs }
        : { currency: 'USD', amount: payment.amountUsd, expected: payment.expectedUsd }
}

export function paymentFlags(
    payment: Pick<
        OrderPayment,
        'method' | 'amountBs' | 'expectedBs' | 'amountUsd' | 'expectedUsd' | 'duplicateReference'
    >,
): PaymentFlagsDto {
    const { currency, amount, expected } = paymentAmounts(payment)
    const difference = amountDifference(amount ?? 0, expected ?? 0)
    return {
        duplicateReference: payment.duplicateReference,
        currency,
        amountMismatch: difference !== 0,
        amountDifference: difference,
    }
}

/** The amount the order's method pays: bolívars at the frozen rate, or dollars. */
export function amountDue(
    order: Pick<Order, 'paymentMethod' | 'totalBs' | 'totalUsd'>,
): AmountDueDto {
    const currency = PAYMENT_METHOD_CURRENCY[order.paymentMethod]
    return { currency, amount: currency === 'VES' ? order.totalBs : order.totalUsd }
}

/**
 * The payment section for the customer: offered methods keep their details, the others are
 * replaced by their disabled, empty defaults (half-filled details never leak).
 */
export function offeredPayment(payment: PaymentContent): PaymentContent {
    const defaults = DEFAULT_SITE_CONTENT.payment
    return {
        instructions: payment.instructions,
        pagoMovil: isMethodConfigured(payment, 'PAGO_MOVIL')
            ? payment.pagoMovil
            : { ...defaults.pagoMovil },
        transfer: isMethodConfigured(payment, 'TRANSFERENCIA')
            ? payment.transfer
            : { ...defaults.transfer },
        zelle: isMethodConfigured(payment, 'ZELLE') ? payment.zelle : { ...defaults.zelle },
        binance: isMethodConfigured(payment, 'BINANCE') ? payment.binance : { ...defaults.binance },
    }
}

export function sortByDate<T extends { createdAt: Date }>(rows: readonly T[]): T[] {
    return [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}

function toCustomer(order: Order): OrderCustomerDto {
    return {
        fullName: order.customerName,
        email: order.customerEmail,
        phone: order.customerPhone,
        idNumber: order.customerIdNumber,
        city: order.city,
        address: order.address,
        deliveryMethod: order.deliveryMethod,
        notes: order.notes,
    }
}

function toItem(item: OrderItem): OrderItemDto {
    return {
        productId: item.productId,
        productName: item.productName,
        productSlug: item.productSlug,
        variantId: item.variantId,
        variantLabel: item.variantLabel,
        brand: item.brand,
        model: item.model,
        stockMode: item.stockMode,
        imageUrl: item.imageUrl,
        unitPriceUsd: item.unitPriceUsd,
        quantity: item.quantity,
        lineTotalUsd: item.lineTotalUsd,
    }
}

function toTotals(order: Order): OrderTotalsDto {
    return {
        subtotalUsd: order.subtotalUsd,
        discountUsd: order.discountUsd,
        shippingUsd: order.shippingUsd,
        totalUsd: order.totalUsd,
        totalBs: order.totalBs,
        exchangeRate: order.exchangeRate,
        exchangeRateDate: order.exchangeRateDate,
        exchangeRateSource: order.exchangeRateSource,
        exchangeRateSourceLabel: RATE_SOURCE_LABELS[order.exchangeRateSource],
    }
}

function toPublicPayment(payment: OrderPayment): PublicPaymentDto {
    return {
        id: payment.id,
        method: payment.method,
        reference: payment.reference,
        payerBankCode: payment.payerBankCode,
        payerBankName: payment.payerBankName,
        payerPhone: payment.payerPhone,
        payerIdNumber: payment.payerIdNumber,
        payerName: payment.payerName,
        payerAccount: payment.payerAccount,
        paidOn: payment.paidOn,
        amountBs: payment.amountBs,
        amountUsd: payment.amountUsd,
        expectedBs: payment.expectedBs,
        expectedUsd: payment.expectedUsd,
        status: payment.status,
        hasProof: payment.hasProof,
        late: payment.late,
        duplicateReference: payment.duplicateReference,
        source: payment.source,
        rejectionReason: payment.rejectionReason,
        createdAt: payment.createdAt.toISOString(),
        reviewedAt: payment.reviewedAt?.toISOString() ?? null,
    }
}

function sortedItems(order: Order): OrderItem[] {
    return [...(order.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * A payment proof may be recorded while the order waits for one, even after the deadline or
 * once expired (flagged as late): a real payment is never refused. CANCELADO stays closed.
 */
export function canSubmitPayment(order: Pick<Order, 'status'>): boolean {
    return PAYABLE_STATUSES.includes(order.status)
}

/**
 * A payment is late when the day the customer says they paid (Caracas calendar day) comes after
 * the day the deadline falls on. When the proof is uploaded does not matter: paying on time and
 * uploading later is fine, since the Bs amount was paid at the rate it was quoted at.
 */
export function isLatePayment(order: Pick<Order, 'paymentDueAt'>, paidOn: string): boolean {
    return paidOn > caracasDay(order.paymentDueAt)
}

/**
 * `label` names each status (the catalog's admin label, see `OrderStatusCatalogService`) and
 * `methodLabel` each payment method (`PaymentMethodCatalogService`). `payment`: the store's
 * current payment section (`GET /content`).
 */
export function toPublicOrder(
    order: Order,
    payment: PaymentContent,
    label: StatusLabeler,
    methodLabel: PaymentMethodLabeler,
): PublicOrderDto {
    return {
        code: order.code,
        status: order.status,
        statusLabel: label(order.status),
        createdAt: order.createdAt.toISOString(),
        paymentDueAt: order.paymentDueAt.toISOString(),
        canSubmitPayment: canSubmitPayment(order),
        canChangePaymentMethod: METHOD_SWITCH_STATUSES.includes(order.status),
        receiptAvailable: hasReceipt(order, order.payments ?? []),
        ...methodFields(order, methodLabel),
        customer: toCustomer(order),
        items: sortedItems(order).map(toItem),
        totals: toTotals(order),
        payment: offeredPayment(payment),
        availablePaymentMethods: configuredMethods(payment),
        payments: sortByDate(order.payments ?? [])
            .reverse()
            .map(toPublicPayment),
        history: sortByDate(order.history ?? []).map((entry) => ({
            status: entry.toStatus,
            label: label(entry.toStatus),
            at: entry.createdAt.toISOString(),
            note: PUBLIC_NOTE_STATUSES.includes(entry.toStatus) ? entry.note : null,
        })),
    }
}

function toAdminHistory(entry: OrderStatusHistory, label: StatusLabeler): AdminHistoryEntryDto {
    return {
        from: entry.fromStatus,
        to: entry.toStatus,
        label: label(entry.toStatus),
        actor: entry.actorType,
        actorName: entry.actorUser?.name ?? ACTOR_NAMES[entry.actorType],
        note: entry.note,
        at: entry.createdAt.toISOString(),
    }
}

function toAdminNote(note: OrderNote): AdminNoteDto {
    return {
        id: note.id,
        body: note.body,
        author: note.author ? { id: note.author.id, name: note.author.name } : null,
        createdAt: note.createdAt.toISOString(),
    }
}

function methodFields(order: Order, methodLabel: PaymentMethodLabeler) {
    return {
        paymentMethod: order.paymentMethod,
        paymentMethodLabel: methodLabel(order.paymentMethod),
        amountDue: amountDue(order),
        hasOnOrderItems: order.hasOnOrderItems,
        wantsInstallation: order.wantsInstallation,
    }
}

export function proofPath(code: string, paymentId: string): string {
    return `/admin/orders/${encodeURIComponent(code)}/payments/${encodeURIComponent(paymentId)}/proof`
}

/** `stockConflict`: the order's conflict refreshed with the current stock (`liveStockConflict`). */
export function toAdminOrder(
    order: Order,
    transitions: readonly TransitionRule[],
    label: StatusLabeler,
    methodLabel: PaymentMethodLabeler,
    stockConflict: LiveStockConflict | null,
): AdminOrderDto {
    return {
        id: order.id,
        code: order.code,
        status: order.status,
        statusLabel: label(order.status),
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
        paymentDueAt: order.paymentDueAt.toISOString(),
        stockRestored: order.stockRestored,
        latePayment: order.latePayment,
        stockConflict,
        receiptAvailable: hasReceipt(order, order.payments ?? []),
        ...methodFields(order, methodLabel),
        refund: order.refundStatus
            ? {
                  status: order.refundStatus,
                  label: REFUND_STATUS_LABELS[order.refundStatus],
                  reference: order.refundReference ?? null,
                  refundedAt: order.refundedAt?.toISOString() ?? null,
                  refundedBy: order.refundedBy
                      ? { id: order.refundedBy.id, name: order.refundedBy.name }
                      : null,
              }
            : null,
        customer: toCustomer(order),
        items: sortedItems(order).map((item) => ({ ...toItem(item), id: item.id })),
        totals: toTotals(order),
        payments: sortByDate(order.payments ?? [])
            .reverse()
            .map((payment) => ({
                ...toPublicPayment(payment),
                ...paymentFlags(payment),
                methodLabel: methodLabel(payment.method),
                recordedBy: payment.recordedBy
                    ? { id: payment.recordedBy.id, name: payment.recordedBy.name }
                    : null,
                proofPath: payment.hasProof ? proofPath(order.code, payment.id) : null,
                reviewedBy: payment.reviewedBy
                    ? { id: payment.reviewedBy.id, name: payment.reviewedBy.name }
                    : null,
            })),
        history: sortByDate(order.history ?? []).map((entry) => toAdminHistory(entry, label)),
        notes: sortByDate(order.adminNotes ?? [])
            .reverse()
            .map(toAdminNote),
        allowedTransitions: transitions.map((rule) => ({
            to: rule.to,
            label: label(rule.to),
            requiresReason: rule.requiresReason === true,
            restoresStock: rule.restoresStock === true && !order.stockRestored,
            requiresPayment: rule.requiresPayment === true,
            reactivates: rule.reactivates === true,
        })),
    }
}
