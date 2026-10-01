import { BadRequestException } from '@nestjs/common'
import {
    designTextsSummary,
    layersSummary,
    lowestDpi,
    normalizeText,
    parseRequestedLayers,
    type DesignLayer,
} from './design-layers.js'

const PLACEMENT = { x: 0, y: 0, scale: 1, rotation: 0 }
const image = (assetIndex: number, z: number) => ({
    type: 'image',
    z,
    assetIndex,
    placement: PLACEMENT,
})
const text = (z: number, extra: Record<string, unknown> = {}) => ({
    type: 'text',
    z,
    placement: PLACEMENT,
    content: 'Sofía 7',
    font: 'caveat',
    color: '#ff00aa',
    ...extra,
})

function messageOf(run: () => unknown): string {
    try {
        run()
    } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException)
        return (error as BadRequestException).message
    }
    throw new Error('Expected a BadRequestException')
}

describe('parseRequestedLayers', () => {
    it('orders the layers by z, renumbers them and fills the text defaults', () => {
        const layers = parseRequestedLayers(
            JSON.stringify([text(10), image(1, -3), image(0, 4)]),
            2,
        )
        expect(layers).toEqual([
            { type: 'image', z: 0, assetIndex: 1, placement: PLACEMENT },
            { type: 'image', z: 1, assetIndex: 0, placement: PLACEMENT },
            {
                type: 'text',
                z: 2,
                placement: PLACEMENT,
                content: 'Sofía 7',
                font: 'caveat',
                color: '#FF00AA',
                outline: 'none',
                align: 'center',
            },
        ])
    })

    it('limits the counts: 5 images, 3 texts, at least one layer', () => {
        const six = Array.from({ length: 6 }, (_, index) => image(index, index))
        expect(messageOf(() => parseRequestedLayers(six, 6))).toBe(
            'Puedes usar hasta 5 imágenes por diseño.',
        )
        expect(messageOf(() => parseRequestedLayers([text(0), text(1), text(2), text(3)], 0))).toBe(
            'Puedes usar hasta 3 textos por diseño.',
        )
        expect(messageOf(() => parseRequestedLayers([], 0))).toBe(
            'Agrega una imagen o un texto a tu diseño.',
        )
        const five = Array.from({ length: 5 }, (_, index) => image(index, index))
        expect(parseRequestedLayers([...five, text(5), text(6), text(7)], 5)).toHaveLength(8)
    })

    it('only accepts the fonts of the editor', () => {
        for (const font of [
            'fredoka',
            'jakarta',
            'pacifico',
            'bebas',
            'baloo',
            'caveat',
            'playfair',
        ]) {
            expect(parseRequestedLayers([text(0, { font })], 0)).toHaveLength(1)
        }
        expect(messageOf(() => parseRequestedLayers([text(0, { font: 'Arial' })], 0))).toBe(
            'Elige una de nuestras fuentes para el texto 1.',
        )
        expect(messageOf(() => parseRequestedLayers([text(0, { font: 'toString' })], 0))).toBe(
            'Elige una de nuestras fuentes para el texto 1.',
        )
    })

    it('checks the text length (1–60 characters, 2 lines) and its color', () => {
        expect(parseRequestedLayers([text(0, { content: 'ñ'.repeat(60) })], 0)).toHaveLength(1)
        expect(
            messageOf(() => parseRequestedLayers([text(0, { content: 'ñ'.repeat(61) })], 0)),
        ).toMatch(/^Escribe el texto 1/)
        expect(messageOf(() => parseRequestedLayers([text(0, { content: 42 })], 0))).toMatch(
            /^Escribe el texto 1/,
        )
        expect(messageOf(() => parseRequestedLayers([text(0, { color: '#fff' })], 0))).toBe(
            'El color del texto 1 debe ser un color #RRGGBB.',
        )
    })

    it('matches every original with exactly one image layer', () => {
        expect(messageOf(() => parseRequestedLayers([image(0, 0)], 2))).toBe(
            'Cada imagen del diseño debe venir con su archivo original.',
        )
        expect(messageOf(() => parseRequestedLayers([image(1, 0)], 1))).toBe(
            'Cada imagen del diseño debe venir con su archivo original.',
        )
        expect(messageOf(() => parseRequestedLayers([image(0.5, 0)], 1))).toBe(
            'Cada imagen del diseño debe venir con su archivo original.',
        )
    })

    it('refuses repeated or missing z and placements out of range', () => {
        expect(messageOf(() => parseRequestedLayers([image(0, 1), text(1)], 1))).toBe(
            'El orden de las capas no es válido.',
        )
        expect(messageOf(() => parseRequestedLayers([{ ...image(0, 0), z: undefined }], 1))).toBe(
            'El orden de las capas no es válido.',
        )
        const far = { ...image(0, 0), placement: { ...PLACEMENT, x: 6 } }
        expect(messageOf(() => parseRequestedLayers([far], 1))).toBe(
            'La ubicación de la imagen 1 no es válida.',
        )
        const huge = { ...text(0), placement: { ...PLACEMENT, scale: 21 } }
        expect(messageOf(() => parseRequestedLayers([huge], 0))).toBe(
            'El tamaño del texto 1 está fuera de rango.',
        )
    })
})

describe('normalizeText', () => {
    it('trims each line and drops empty outer lines', () => {
        expect(normalizeText('  Sofía \r\n 7 \n')).toBe('Sofía\n7')
        expect(normalizeText('\nLuna')).toBe('Luna')
        expect(normalizeText('a\n\nb')).toBeNull()
        expect(normalizeText(' ')).toBeNull()
    })
})

describe('layer summaries', () => {
    const layers = [
        { type: 'image', dpi: 120 },
        { type: 'text', content: 'Sofía\n7' },
        { type: 'image', dpi: 300 },
        { type: 'text', content: 'Luna' },
    ] as unknown as DesignLayer[]

    it('lists the texts, counts the layers and keeps the lowest DPI', () => {
        expect(designTextsSummary(layers)).toBe('«Sofía / 7», «Luna»')
        expect(designTextsSummary([])).toBeNull()
        expect(layersSummary(layers)).toBe('2 imágenes · 2 textos')
        expect(layersSummary(layers.slice(0, 2))).toBe('1 imagen · 1 texto')
        expect(lowestDpi(layers)).toBe(120)
        expect(lowestDpi(layers.filter((layer) => layer.type === 'text'))).toBeNull()
    })
})
