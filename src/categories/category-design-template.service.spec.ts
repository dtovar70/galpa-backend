import { BadRequestException } from '@nestjs/common'
import { defaultPrintArea, normalizePrintArea } from './category-design-template.service.js'

describe('defaultPrintArea', () => {
    it('centers half of the photo in the print proportion', () => {
        // Landscape photo, landscape print (20 × 8.5 cm): limited by the width.
        expect(defaultPrintArea({ width: 1200, height: 900 }, 8.5 / 20)).toEqual({
            x: 0.25,
            y: 0.3584,
            width: 0.5,
            height: 0.2833,
        })
        // Portrait print on a landscape photo: limited by the height.
        expect(defaultPrintArea({ width: 1000, height: 800 }, 30 / 25)).toEqual({
            x: 0.3334,
            y: 0.25,
            width: 0.3333,
            height: 0.5,
        })
    })

    it('falls back to a square without a print size', () => {
        expect(defaultPrintArea({ width: 800, height: 800 }, null)).toEqual({
            x: 0.25,
            y: 0.25,
            width: 0.5,
            height: 0.5,
        })
    })
})

describe('normalizePrintArea', () => {
    it('rounds the area and keeps it inside the photo', () => {
        expect(normalizePrintArea({ x: 0.123456, y: 0, width: 0.876544, height: 1 })).toEqual({
            x: 0.1235,
            y: 0,
            width: 0.8765,
            height: 1,
        })
    })

    it('refuses an area that overflows the photo, in Spanish, on printArea', () => {
        const attempt = () => normalizePrintArea({ x: 0.5, y: 0.5, width: 0.6, height: 0.2 })
        expect(attempt).toThrow(BadRequestException)
        expect(attempt).toThrow('El área de impresión debe quedar dentro de la foto.')
        try {
            attempt()
        } catch (error) {
            expect((error as BadRequestException).getResponse()).toMatchObject({
                details: [{ field: 'printArea' }],
            })
        }
    })
})
