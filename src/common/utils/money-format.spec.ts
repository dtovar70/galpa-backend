import { formatBs, formatUsd, formatVeNumber } from './money-format.js'

describe('money format', () => {
    it('uses Venezuelan separators', () => {
        expect(formatVeNumber(1234.5)).toBe('1.234,50')
        expect(formatVeNumber(30760.69)).toBe('30.760,69')
        expect(formatVeNumber(0)).toBe('0,00')
        expect(formatVeNumber(1234567.891, 4)).toBe('1.234.567,8910')
        expect(formatVeNumber(-5)).toBe('-5,00')
        expect(formatUsd(36)).toBe('$36,00')
        expect(formatBs(30760.69)).toBe('Bs. 30.760,69')
    })
})
