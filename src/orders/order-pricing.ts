/**
 * Money math for orders. Amounts are handled in integer cents (and the rate in 1/10000 units),
 * so sums never pick up floating-point noise; results are converted back to numbers with 2
 * decimals only at the edges.
 */

export type DeliveryMethod = 'delivery' | 'pickup'

export interface ShippingRules {
    /** USD; subtotals at or above it ship free. */
    freeThreshold: number
    /** USD charged below the threshold. */
    flatRate: number
}

export function toCents(usd: number): number {
    return Math.round(usd * 100)
}

export function fromCents(cents: number): number {
    return cents / 100
}

/** Product price plus the variant's price delta, in cents. */
export function unitPriceCents(productPrice: number, variantDelta = 0): number {
    return toCents(productPrice) + toCents(variantDelta)
}

/** Store pickup is free; delivery is free at the threshold and the flat rate below it. */
export function shippingCents(
    subtotalCents: number,
    method: DeliveryMethod,
    rules: ShippingRules,
): number {
    if (method === 'pickup') return 0
    return subtotalCents >= toCents(rules.freeThreshold) ? 0 : toCents(rules.flatRate)
}

/** USD total -> bolívares at `rate` (Bs per USD, 4 decimals), rounded half-up to 2 decimals. */
export function bolivarsFromUsd(totalUsd: number, rate: number): number {
    const rateUnits = Math.round(rate * 10_000)
    const bsCents = Math.round((toCents(totalUsd) * rateUnits) / 10_000)
    return bsCents / 100
}

export interface PricedLineInput {
    unitCents: number
    quantity: number
}

export interface OrderTotals {
    subtotalUsd: number
    discountUsd: number
    shippingUsd: number
    totalUsd: number
    totalBs: number
}

/**
 * `discountCents` (orders converted from a quote) comes off the subtotal, never below 0, before
 * the shipping rules are applied.
 */
export function computeTotals(
    lines: readonly PricedLineInput[],
    method: DeliveryMethod,
    rules: ShippingRules,
    rate: number,
    discountCents = 0,
): OrderTotals {
    const subtotal = lines.reduce((sum, line) => sum + line.unitCents * line.quantity, 0)
    const discount = Math.min(Math.max(0, discountCents), subtotal)
    const shipping = shippingCents(subtotal - discount, method, rules)
    const totalUsd = fromCents(subtotal - discount + shipping)
    return {
        subtotalUsd: fromCents(subtotal),
        discountUsd: fromCents(discount),
        shippingUsd: fromCents(shipping),
        totalUsd,
        totalBs: bolivarsFromUsd(totalUsd, rate),
    }
}

/** Paid minus expected, with 2 decimals (0 when they match to the cent); any currency. */
export function amountDifference(paid: number, expected: number): number {
    return (toCents(paid) - toCents(expected)) / 100
}
