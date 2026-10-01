/**
 * How a customer pays an order. Pago Móvil and transfers are paid in bolívares at the order's BCV
 * rate (`totalBs`); Zelle and Binance in US dollars (`totalUsd`).
 */
export const PAYMENT_METHODS = ['PAGO_MOVIL', 'TRANSFERENCIA', 'ZELLE', 'BINANCE'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export type PaymentCurrency = 'VES' | 'USD'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
    PAGO_MOVIL: 'Pago Móvil',
    TRANSFERENCIA: 'Transferencia bancaria',
    ZELLE: 'Zelle',
    BINANCE: 'Binance Pay',
}

export const PAYMENT_METHOD_CURRENCY: Record<PaymentMethod, PaymentCurrency> = {
    PAGO_MOVIL: 'VES',
    TRANSFERENCIA: 'VES',
    ZELLE: 'USD',
    BINANCE: 'USD',
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
    return typeof value === 'string' && (PAYMENT_METHODS as readonly string[]).includes(value)
}

/** Paid in bolívares (the amount to compare is `totalBs`), otherwise in dollars. */
export function paysInBolivars(method: PaymentMethod): boolean {
    return PAYMENT_METHOD_CURRENCY[method] === 'VES'
}
