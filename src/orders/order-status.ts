import { Role } from '../auth/role.enum.js'

/**
 * The status codes the workflow knows. Their labels, customer copy, badge tones and admin tabs
 * live in the `order_statuses` / `order_status_groups` tables (`OrderStatusCatalogService`),
 * whose codes must match this list exactly (checked at startup).
 */
export const ORDER_STATUSES = [
    'PENDIENTE_PAGO',
    'PENDIENTE_VERIFICACION',
    'PAGO_VERIFICADO',
    'PAGO_RECHAZADO',
    'ESPERANDO_MERCANCIA',
    'EN_PREPARACION',
    'LISTO_PARA_RETIRO',
    'DESPACHADO',
    'ENTREGADO',
    'CANCELADO',
    'EXPIRADO',
] as const

export type OrderStatus = (typeof ORDER_STATUSES)[number]

export function isOrderStatus(value: string): value is OrderStatus {
    return (ORDER_STATUSES as readonly string[]).includes(value)
}

/**
 * Statuses in which a payment proof may be recorded (by the customer or, for a proof sent by
 * WhatsApp, by the admin). There is no deadline check: a real payment is never refused, a late
 * one is flagged for the owner instead. CANCELADO stays closed.
 */
export const PAYABLE_STATUSES: readonly OrderStatus[] = [
    'PENDIENTE_PAGO',
    'PAGO_RECHAZADO',
    'EXPIRADO',
]

/** What the customer said about money to give back when an order with a payment is cancelled. */
export const REFUND_STATUSES = ['NO_APLICA', 'PENDIENTE', 'REEMBOLSADO'] as const
export type RefundStatus = (typeof REFUND_STATUSES)[number]

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
    NO_APLICA: 'No aplica',
    PENDIENTE: 'Reembolso pendiente',
    REEMBOLSADO: 'Reembolsado',
}

/**
 * Statuses an order can only reach after its payment was verified: the ones where a purchase
 * receipt ("Comprobante de compra") exists. CANCELADO never has one, even after a verified
 * payment. The receipt endpoints still check the verified payment itself.
 */
export const RECEIPT_STATUSES: readonly OrderStatus[] = [
    'PAGO_VERIFICADO',
    'ESPERANDO_MERCANCIA',
    'EN_PREPARACION',
    'LISTO_PARA_RETIRO',
    'DESPACHADO',
    'ENTREGADO',
]

/** The customer may still switch the payment method (`PATCH /orders/:code/payment-method`). */
export const METHOD_SWITCH_STATUSES: readonly OrderStatus[] = ['PENDIENTE_PAGO', 'PAGO_RECHAZADO']

/** Orders in these statuses no longer hold stock nor count for duplicate references. */
export const CLOSED_STATUSES: readonly OrderStatus[] = ['CANCELADO', 'EXPIRADO']

/**
 * Orders that are over (delivered, cancelled or expired). A mobile operator code that only these
 * orders use can be deleted from `mobile_prefixes`.
 */
export const FINISHED_STATUSES: readonly OrderStatus[] = ['ENTREGADO', ...CLOSED_STATUSES]

/**
 * Who moves an order. `admin` is a back-office user, `telegram` the Telegram bot acting for the
 * owner, `customer` the buyer through their private link, `system` the scheduler.
 */
export type OrderActor =
    | { kind: 'admin'; userId: string; role: Role }
    | { kind: 'telegram'; userId?: string | null }
    | { kind: 'customer' }
    | { kind: 'system' }

export type ActorKind = OrderActor['kind']

export interface TransitionRule {
    to: OrderStatus
    actors: readonly ActorKind[]
    /** For `admin` actors: roles allowed (any role when omitted). */
    adminRoles?: readonly Role[]
    /** A reason/note is mandatory (rejections, cancellations). */
    requiresReason?: boolean
    /** Puts the ordered quantities back into stock. */
    restoresStock?: boolean
    /** Only reachable by recording a payment proof (never through the plain transitions API). */
    requiresPayment?: boolean
    /**
     * Takes the ordered quantities out of stock again (the order had given them back). A payment
     * is never refused for lack of stock: what is missing is flagged as a stock conflict.
     */
    reservesStock?: boolean
    /**
     * Reopens a closed order with a fresh payment deadline. Refused (409) when the stock is not
     * enough, unless the admin forces it (then flagged as a stock conflict).
     */
    reactivates?: boolean
}

const STAFF: readonly ActorKind[] = ['admin', 'telegram']
const CANCEL: TransitionRule = {
    to: 'CANCELADO',
    actors: ['admin'],
    adminRoles: [Role.ADMIN],
    requiresReason: true,
    restoresStock: true,
}

/** A payment proof recorded by the customer, or by an admin for a proof sent by WhatsApp. */
const PAYMENT_RECORDED: TransitionRule = {
    to: 'PENDIENTE_VERIFICACION',
    actors: ['customer', 'admin'],
    requiresPayment: true,
}

/**
 * Every allowed status change. Anything not listed is rejected with 409. This map is the single
 * source of truth for the admin API, the scheduler and the Telegram bot. Only the STOCK-mode
 * lines of an order hold stock, so `restoresStock` / `reservesStock` never touch ON_ORDER lines.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly TransitionRule[]> = {
    PENDIENTE_PAGO: [
        PAYMENT_RECORDED,
        { to: 'EXPIRADO', actors: ['system'], restoresStock: true },
        CANCEL,
    ],
    PENDIENTE_VERIFICACION: [
        { to: 'PAGO_VERIFICADO', actors: STAFF },
        { to: 'PAGO_RECHAZADO', actors: STAFF, requiresReason: true },
    ],
    PAGO_RECHAZADO: [PAYMENT_RECORDED, CANCEL],
    PAGO_VERIFICADO: [
        // Some line is "bajo pedido": the goods are ordered from the supplier first.
        { to: 'ESPERANDO_MERCANCIA', actors: STAFF },
        { to: 'EN_PREPARACION', actors: STAFF },
        CANCEL,
    ],
    ESPERANDO_MERCANCIA: [{ to: 'EN_PREPARACION', actors: STAFF }, CANCEL],
    EN_PREPARACION: [
        // Store pickup.
        { to: 'LISTO_PARA_RETIRO', actors: STAFF },
        // Delivery: the note carries the carrier and tracking details.
        { to: 'DESPACHADO', actors: STAFF },
        CANCEL,
    ],
    LISTO_PARA_RETIRO: [{ to: 'ENTREGADO', actors: STAFF }],
    DESPACHADO: [{ to: 'ENTREGADO', actors: STAFF }],
    ENTREGADO: [],
    CANCELADO: [],
    EXPIRADO: [
        // A late payment: accepted, flagged, and the stock is taken again if it is there.
        { ...PAYMENT_RECORDED, reservesStock: true },
        { to: 'PENDIENTE_PAGO', actors: ['admin'], reservesStock: true, reactivates: true },
    ],
}

export type TransitionCheck =
    { ok: true; rule: TransitionRule } | { ok: false; reason: 'invalid' | 'forbidden' }

function actorMayUse(rule: TransitionRule, actor: OrderActor): boolean {
    if (!rule.actors.includes(actor.kind)) return false
    if (actor.kind === 'admin' && rule.adminRoles) return rule.adminRoles.includes(actor.role)
    return true
}

/**
 * `invalid`: the move does not exist for this actor kind (409). `forbidden`: it exists for the
 * actor kind but not for this admin role (403), e.g. an EDITOR cancelling.
 */
export function checkTransition(
    from: OrderStatus,
    to: OrderStatus,
    actor: OrderActor,
): TransitionCheck {
    const rule = ORDER_TRANSITIONS[from].find(
        (candidate) => candidate.to === to && candidate.actors.includes(actor.kind),
    )
    if (!rule) return { ok: false, reason: 'invalid' }
    return actorMayUse(rule, actor) ? { ok: true, rule } : { ok: false, reason: 'forbidden' }
}

/** Moves this actor may make from `from` (drives the admin's action buttons). */
export function allowedTransitions(from: OrderStatus, actor: OrderActor): TransitionRule[] {
    return ORDER_TRANSITIONS[from].filter((rule) => actorMayUse(rule, actor))
}

/** `label` names a status (the catalog's admin label). */
export function invalidTransitionMessage(
    from: OrderStatus,
    to: OrderStatus,
    label: (status: OrderStatus) => string,
): string {
    return `No se puede pasar un pedido de «${label(from)}» a «${label(to)}».`
}
