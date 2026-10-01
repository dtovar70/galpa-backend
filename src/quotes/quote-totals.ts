import { bolivarsFromUsd, fromCents, toCents } from '../orders/order-pricing.js'

export interface QuoteLineAmounts {
    quantity: number
    unitPrice: number
}

export interface QuoteTotals {
    /** Per line, in input order. */
    lineTotals: number[]
    subtotal: number
    discount: number
    total: number
    /** Null without a rate. */
    totalBs: number | null
}

/**
 * Quote money math in integer cents: each line is quantity × unit price, the discount comes off
 * the subtotal (never below 0), and the bolívar total is a reference at `rate` (Bs per USD).
 */
export function computeQuoteTotals(
    lines: readonly QuoteLineAmounts[],
    discount: number,
    rate: number | null,
): QuoteTotals {
    const lineCents = lines.map((line) => toCents(line.unitPrice) * line.quantity)
    const subtotalCents = lineCents.reduce((sum, cents) => sum + cents, 0)
    const discountCents = Math.min(Math.max(0, toCents(discount)), subtotalCents)
    const total = fromCents(subtotalCents - discountCents)
    return {
        lineTotals: lineCents.map(fromCents),
        subtotal: fromCents(subtotalCents),
        discount: fromCents(discountCents),
        total,
        totalBs: rate === null ? null : bolivarsFromUsd(total, rate),
    }
}
