import { contactOptionCode, uniqueCode } from './contact-options.service.js'

describe('contact option codes', () => {
    it('turns a label into an UPPER_SNAKE code without accents', () => {
        expect(contactOptionCode('Asesoría para elegir un equipo')).toBe(
            'ASESORIA_PARA_ELEGIR_UN_EQUIPO',
        )
        expect(contactOptionCode('  Soporte, repuestos o garantía!  ')).toBe(
            'SOPORTE_REPUESTOS_O_GARANTIA',
        )
        expect(contactOptionCode('Ñandú 2x1')).toBe('NANDU_2X1')
        expect(contactOptionCode('¿?')).toBe('OPCION')
    })

    it('keeps codes within 40 characters, without a trailing underscore', () => {
        const code = contactOptionCode('Instalación de equipos centrales en edificios comerciales')
        expect(code.length).toBeLessThanOrEqual(40)
        expect(code).toMatch(/^[A-Z0-9]+(_[A-Z0-9]+)*$/)
    })

    it('adds a numeric suffix when the code is taken', () => {
        expect(uniqueCode('OTRO', new Set())).toBe('OTRO')
        expect(uniqueCode('OTRO', new Set(['OTRO', 'OTRO_2']))).toBe('OTRO_3')
        const long = 'A'.repeat(40)
        expect(uniqueCode(long, new Set([long]))).toBe(`${'A'.repeat(38)}_2`)
    })
})
