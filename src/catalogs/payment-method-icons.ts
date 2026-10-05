/**
 * Icons a payment method may show at checkout and in the panel: names of the storefront's icon
 * set (frontend-galpa maps each one to its component). Enforced by a CHECK on
 * `payment_methods.icon`.
 */
export const PAYMENT_METHOD_ICONS = [
    'smartphone',
    'building',
    'landmark',
    'dollar-sign',
    'bitcoin',
    'wallet',
    'credit-card',
    'banknote',
] as const

export type PaymentMethodIcon = (typeof PAYMENT_METHOD_ICONS)[number]
