import { isRateStale, rateUsableUntil } from './exchange-rate.service.js'

describe('rate freshness', () => {
    it('measures the age from the start of the fecha valor (Caracas)', () => {
        expect(rateUsableUntil('2026-09-24', 72).toISOString()).toBe('2026-09-27T04:00:00.000Z')
    })

    it('is usable up to the max age and stale after it', () => {
        expect(isRateStale('2026-09-24', 72, new Date('2026-09-27T03:59:59Z'))).toBe(false)
        expect(isRateStale('2026-09-24', 72, new Date('2026-09-27T04:00:01Z'))).toBe(true)
    })

    it('treats a rate published for the next business day as fresh', () => {
        // Friday afternoon the BCV publishes Monday's rate.
        expect(isRateStale('2026-09-28', 72, new Date('2026-09-25T20:00:00Z'))).toBe(false)
    })
})
