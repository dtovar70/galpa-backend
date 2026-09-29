import { feminine, masculine, msg } from './messages.js'

describe('validation messages', () => {
    it('agrees with the grammatical gender of the field', () => {
        expect(msg.required(masculine('El precio'))).toBe('El precio es obligatorio.')
        expect(msg.required(feminine('La etiqueta'))).toBe('La etiqueta es obligatoria.')
        expect(msg.notNegative(feminine('La valoración'))).toBe(
            'La valoración no puede ser negativa.',
        )
    })

    it('pluralizes the minimum list size', () => {
        expect(msg.listMinSize(feminine('La lista'), 1)).toBe(
            'La lista debe tener al menos 1 elemento.',
        )
        expect(msg.listMinSize(feminine('La lista'), 2)).toBe(
            'La lista debe tener al menos 2 elementos.',
        )
    })

    it('asks for an exact number of digits', () => {
        expect(msg.exactDigits(feminine('La referencia'), 6)).toBe(
            'La referencia debe tener exactamente 6 dígitos.',
        )
    })

    it('formats large numbers the Venezuelan way', () => {
        expect(msg.max(masculine('El precio'), 99_999_999.99)).toBe(
            'El precio no puede ser mayor que 99.999.999,99.',
        )
    })
})
