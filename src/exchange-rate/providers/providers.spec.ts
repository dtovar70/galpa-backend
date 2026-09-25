import { readFileSync } from 'node:fs'
import { parseBcvHtml } from './bcv.provider.js'
import { parseDolarApiJson } from './dolarapi.provider.js'

const fixture = (name: string) =>
    readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8')

describe('parseBcvHtml', () => {
    it('reads the USD rate (not the EUR/CNY ones above it) and the fecha valor', () => {
        expect(parseBcvHtml(fixture('bcv-home.html'))).toEqual({
            rate: 854.4637,
            effectiveDate: '2026-09-24',
        })
    })

    it('handles thousands separators', () => {
        const html =
            '<div id="dolar"><strong class="strong-tb"> 1.234,56780000</strong></div>' +
            'Fecha Valor: <span content="2026-10-01T00:00:00-04:00">x</span>'
        expect(parseBcvHtml(html)).toEqual({ rate: 1234.5678, effectiveDate: '2026-10-01' })
    })

    it('fails loudly when the page changed', () => {
        expect(() => parseBcvHtml('<html>mantenimiento</html>')).toThrow(/USD block/)
        expect(() => parseBcvHtml('<div id="dolar"><strong>abc</strong></div>')).toThrow(/rate/)
        expect(() => parseBcvHtml('<div id="dolar"><strong>0,00000000</strong></div>')).toThrow(
            /implausible/,
        )
        expect(() => parseBcvHtml('<div id="dolar"><strong>854,46</strong></div>')).toThrow(
            /fecha valor/,
        )
    })
})

describe('parseDolarApiJson', () => {
    it('reads `promedio` and the Caracas day of `fechaActualizacion`', () => {
        expect(parseDolarApiJson(JSON.parse(fixture('dolarapi-oficial.json')))).toEqual({
            rate: 854.4637,
            effectiveDate: '2026-09-24',
        })
    })

    it('converts a UTC stamp to the Caracas calendar day', () => {
        const payload = {
            moneda: 'USD',
            fuente: 'oficial',
            promedio: 850.1,
            fechaActualizacion: '2026-09-25T02:00:00.000Z',
        }
        expect(parseDolarApiJson(payload)).toEqual({ rate: 850.1, effectiveDate: '2026-09-24' })
    })

    it('rejects the parallel rate and malformed payloads', () => {
        const base = JSON.parse(fixture('dolarapi-oficial.json')) as Record<string, unknown>
        expect(() => parseDolarApiJson({ ...base, fuente: 'paralelo' })).toThrow(/official/)
        expect(() => parseDolarApiJson({ ...base, promedio: null })).toThrow(/implausible/)
        expect(() => parseDolarApiJson({ ...base, fechaActualizacion: 'ayer' })).toThrow(/fecha/)
        expect(() => parseDolarApiJson('nope')).toThrow()
    })
})
