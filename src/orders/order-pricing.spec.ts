import {
    amountDifference,
    bolivarsFromUsd,
    computeTotals,
    shippingCents,
    unitPriceCents,
} from './order-pricing.js'

const RULES = { freeThreshold: 35, flatRate: 4 }

describe('order pricing', () => {
    it('adds the variant price delta to the product price without float noise', () => {
        expect(unitPriceCents(12.9, 3.1)).toBe(1600)
        expect(unitPriceCents(0.1, 0.2)).toBe(30)
        expect(unitPriceCents(15)).toBe(1500)
    })

    it('charges the flat rate below the threshold and ships free at it', () => {
        expect(shippingCents(3499, 'delivery', RULES)).toBe(400)
        expect(shippingCents(3500, 'delivery', RULES)).toBe(0)
        expect(shippingCents(9000, 'delivery', RULES)).toBe(0)
    })

    it('never charges shipping for store pickup', () => {
        expect(shippingCents(100, 'pickup', RULES)).toBe(0)
    })

    it('converts to bolívares with the 4-decimal rate, rounding half up to cents', () => {
        expect(bolivarsFromUsd(35, 854.4637)).toBe(29906.23)
        expect(bolivarsFromUsd(19.9, 183.45)).toBe(3650.66)
        // 0.5 cent exactly -> rounds up.
        expect(bolivarsFromUsd(0.01, 0.5)).toBe(0.01)
    })

    it('computes the order totals from the priced lines', () => {
        const totals = computeTotals(
            [
                { unitCents: 1290, quantity: 2 },
                { unitCents: 850, quantity: 1 },
            ],
            'delivery',
            RULES,
            854.4637,
        )
        expect(totals).toEqual({
            subtotalUsd: 34.3,
            discountUsd: 0,
            shippingUsd: 4,
            totalUsd: 38.3,
            totalBs: 32725.96,
        })
        expect(computeTotals([{ unitCents: 1290, quantity: 2 }], 'pickup', RULES, 100)).toEqual({
            subtotalUsd: 25.8,
            discountUsd: 0,
            shippingUsd: 0,
            totalUsd: 25.8,
            totalBs: 2580,
        })
    })

    it('takes a quote discount off the subtotal before the shipping rules, never below 0', () => {
        // 40 - 10 = 30 is under the $35 threshold: the flat rate applies again.
        expect(
            computeTotals([{ unitCents: 4000, quantity: 1 }], 'delivery', RULES, 100, 1000),
        ).toEqual({
            subtotalUsd: 40,
            discountUsd: 10,
            shippingUsd: 4,
            totalUsd: 34,
            totalBs: 3400,
        })
        expect(
            computeTotals([{ unitCents: 4000, quantity: 1 }], 'pickup', RULES, 100, 9000),
        ).toMatchObject({ discountUsd: 40, totalUsd: 0 })
    })

    it('reports the difference between the paid and the expected amount (any currency)', () => {
        expect(amountDifference(29906.23, 29906.23)).toBe(0)
        expect(amountDifference(29900, 29906.23)).toBe(-6.23)
        expect(amountDifference(30000.1, 29906.23)).toBe(93.87)
    })
})
