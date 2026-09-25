import { parseAmount } from './submit-payment.dto.js'

const parse = (value: unknown) => parseAmount({ value } as Parameters<typeof parseAmount>[0])

describe('parseAmount', () => {
    it('accepts Venezuelan and plain formats', () => {
        expect(parse('29.906,23')).toBe(29906.23)
        expect(parse('29906,23')).toBe(29906.23)
        expect(parse('29906.23')).toBe(29906.23)
        expect(parse(' 1500 ')).toBe(1500)
    })

    it('leaves anything else for the validators to reject', () => {
        expect(parse('abc')).toBe('abc')
        expect(parse('')).toBe('')
        expect(parse(12)).toBe(12)
    })
})
