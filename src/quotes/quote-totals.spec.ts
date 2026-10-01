import { computeQuoteTotals } from './quote-totals.js'

describe('computeQuoteTotals', () => {
    it('adds the lines in cents, takes the discount off and converts at the rate', () => {
        expect(
            computeQuoteTotals(
                [
                    { quantity: 2, unitPrice: 640.1 },
                    { quantity: 3, unitPrice: 0.1 },
                ],
                30.5,
                154.4637,
            ),
        ).toEqual({
            lineTotals: [1280.2, 0.3],
            subtotal: 1280.5,
            discount: 30.5,
            total: 1250,
            totalBs: 193079.63,
        })
    })

    it('never discounts below 0 and has no bolívar total without a rate', () => {
        expect(computeQuoteTotals([{ quantity: 1, unitPrice: 50 }], 80, null)).toEqual({
            lineTotals: [50],
            subtotal: 50,
            discount: 50,
            total: 0,
            totalBs: null,
        })
        expect(computeQuoteTotals([{ quantity: 1, unitPrice: 50 }], -5, 10).discount).toBe(0)
    })
})
