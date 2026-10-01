import {
    artworkSize,
    artworkDpi,
    designTemplateFor,
    dpiLevel,
    estimateDpi,
    resolveDesignTemplate,
    type CategoryDesignFields,
} from './design-templates.js'

function category(fields: Partial<CategoryDesignFields> & { slug: string }): CategoryDesignFields {
    return { designPrintWidthCm: null, designPrintHeightCm: null, ...fields }
}

describe('design templates', () => {
    it('only offers the categories with a print area', () => {
        expect(designTemplateFor('mugs')).toEqual({ widthCm: 20, heightCm: 8.5 })
        expect(designTemplateFor('tees')).toEqual({ widthCm: 25, heightCm: 30 })
        expect(designTemplateFor('keychains')).toBeNull()
        expect(designTemplateFor('coolers')).toBeNull()
        expect(designTemplateFor('constructor')).toBeNull()
    })

    it('estimates the printed resolution from the pixels spread over the covered width', () => {
        const mug = designTemplateFor('mugs')!
        // 20 cm = 7.87 in: 2362 px across the whole area is 300 DPI.
        expect(estimateDpi(2362, 1, mug)).toBe(300)
        // Twice as wide as the area: half the resolution.
        expect(estimateDpi(2362, 2, mug)).toBe(150)
        expect(estimateDpi(591, 1, { widthCm: 5, heightCm: 5 })).toBe(300)
    })

    it('classifies the resolution', () => {
        expect(dpiLevel(300)).toBe('ok')
        expect(dpiLevel(150)).toBe('ok')
        expect(dpiLevel(149)).toBe('low')
        expect(dpiLevel(72)).toBe('low')
        expect(dpiLevel(71)).toBe('veryLow')
    })
})

describe('resolveDesignTemplate', () => {
    it('keeps the illustration templates, preferring the print size from the database', () => {
        expect(resolveDesignTemplate(category({ slug: 'mugs' }), false)).toEqual({
            widthCm: 20,
            heightCm: 8.5,
        })
        expect(
            resolveDesignTemplate(
                category({ slug: 'mugs', designPrintWidthCm: 18, designPrintHeightCm: 8 }),
                false,
            ),
        ).toEqual({ widthCm: 18, heightCm: 8 })
    })

    it('makes a category with garment color photos and a size designable', () => {
        expect(resolveDesignTemplate(category({ slug: 'coolers' }), true)).toBeNull()
        const sized = category({
            slug: 'coolers',
            designPrintWidthCm: 30,
            designPrintHeightCm: 20,
        })
        expect(resolveDesignTemplate(sized, true)).toEqual({ widthCm: 30, heightCm: 20 })
        // A size alone (no photo, no illustration) is not enough.
        expect(resolveDesignTemplate(sized, false)).toBeNull()
    })

    it('sizes the arte final at 200 DPI of the print area, up to 4000 px', () => {
        expect(artworkSize({ widthCm: 20, heightCm: 8.5 })).toEqual({ width: 1575, height: 669 })
        expect(artworkSize({ widthCm: 5, heightCm: 5 })).toEqual({ width: 394, height: 394 })
        expect(artworkSize({ widthCm: 25, heightCm: 30 })).toEqual({ width: 1969, height: 2362 })
        // 60 × 40 cm (4724 px wide) is scaled down to 4000 px.
        expect(artworkSize({ widthCm: 60, heightCm: 40 })).toEqual({ width: 4000, height: 2667 })
        // Lower DPI and caps (to fit 10 MB), but never below 100 DPI.
        expect(artworkSize({ widthCm: 25, heightCm: 30 }, 150)).toEqual({
            width: 1476,
            height: 1772,
        })
        expect(artworkSize({ widthCm: 25, heightCm: 30 }, 200, 1500)).toEqual({
            width: 1250,
            height: 1500,
        })
        expect(artworkSize({ widthCm: 25, heightCm: 30 }, 120, 500)).toEqual({
            width: 984,
            height: 1181,
        })
    })

    it('accepts an arte final shaped like the area at 100–200 DPI', () => {
        const mug = { widthCm: 20, heightCm: 8.5 }
        expect(artworkDpi({ width: 1575, height: 669 }, mug)).toBe(200)
        expect(artworkDpi({ width: 1600, height: 680 }, mug)).toBe(203)
        expect(artworkDpi({ width: 787, height: 334 }, mug)).toBe(100)
        expect(artworkDpi({ width: 1181, height: 502 }, mug)).toBe(150)
        // Too sharp, too soft, or another shape.
        expect(artworkDpi({ width: 1700, height: 722 }, mug)).toBeNull()
        expect(artworkDpi({ width: 700, height: 297 }, mug)).toBeNull()
        expect(artworkDpi({ width: 1575, height: 700 }, mug)).toBeNull()
    })
})
