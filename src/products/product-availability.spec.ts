import {
    ON_ORDER_AVAILABLE_UNITS,
    productAvailability,
    resolveAvailability,
} from './product-availability.js'

const PRODUCTS = [
    { id: 'split', stock: 8, stockMode: 'STOCK' as const, isActive: true },
    { id: 'key', stock: 3, stockMode: 'STOCK' as const, isActive: true },
    { id: 'off', stock: 9, stockMode: 'STOCK' as const, isActive: false },
    { id: 'neg', stock: -2, stockMode: 'STOCK' as const, isActive: true },
    { id: 'ord', stock: 0, stockMode: 'ON_ORDER' as const, isActive: true },
]
const VARIANTS = [
    { id: 'v-11', productId: 'split', stock: 3 },
    { id: 'v-15', productId: 'split', stock: 5 },
    { id: 'v-off', productId: 'off', stock: 0 },
]

describe('resolveAvailability', () => {
    it('reads the stock of the chosen variant', () => {
        expect(
            resolveAvailability([{ productId: 'split', variantId: 'v-15' }], PRODUCTS, VARIANTS),
        ).toEqual([
            {
                productId: 'split',
                variantId: 'v-15',
                stock: 5,
                stockMode: 'STOCK',
                isActive: true,
                exists: true,
            },
        ])
    })

    it('reads the product stock when the product has no variants', () => {
        expect(resolveAvailability([{ productId: 'key' }], PRODUCTS, VARIANTS)).toEqual([
            {
                productId: 'key',
                variantId: null,
                stock: 3,
                stockMode: 'STOCK',
                isActive: true,
                exists: true,
            },
        ])
    })

    it('keeps the request order and repeats duplicated lines', () => {
        const result = resolveAvailability(
            [
                { productId: 'split', variantId: 'v-11' },
                { productId: 'key' },
                { productId: 'split', variantId: 'v-11' },
            ],
            PRODUCTS,
            VARIANTS,
        )
        expect(result.map((item) => [item.productId, item.variantId, item.stock])).toEqual([
            ['split', 'v-11', 3],
            ['key', null, 3],
            ['split', 'v-11', 3],
        ])
    })

    it('reports inactive products with their stock', () => {
        expect(
            resolveAvailability([{ productId: 'off', variantId: 'v-off' }], PRODUCTS, VARIANTS)[0],
        ).toMatchObject({ isActive: false, exists: true, stock: 0 })
    })

    it('marks unknown products, unknown or foreign variants and missing choices as not existing', () => {
        const result = resolveAvailability(
            [
                { productId: 'nope', variantId: 'v-11' },
                { productId: 'split', variantId: 'gone' },
                { productId: 'key', variantId: 'v-11' },
                { productId: 'split' },
            ],
            PRODUCTS,
            VARIANTS,
        )
        expect(result.map((item) => [item.exists, item.stock, item.isActive])).toEqual([
            [false, 0, false],
            [false, 0, true],
            [false, 0, true],
            [false, 0, true],
        ])
    })

    it('never reports negative stock', () => {
        expect(resolveAvailability([{ productId: 'neg' }], PRODUCTS, [])[0]?.stock).toBe(0)
    })

    it('treats ON_ORDER products as always available', () => {
        expect(resolveAvailability([{ productId: 'ord' }], PRODUCTS, [])[0]).toMatchObject({
            stock: ON_ORDER_AVAILABLE_UNITS,
            stockMode: 'ON_ORDER',
            exists: true,
        })
    })
})

describe('productAvailability', () => {
    it('is IN_STOCK or OUT_OF_STOCK for STOCK products and ON_ORDER otherwise', () => {
        expect(productAvailability({ stockMode: 'STOCK', stock: 2 })).toBe('IN_STOCK')
        expect(productAvailability({ stockMode: 'STOCK', stock: 0 })).toBe('OUT_OF_STOCK')
        expect(productAvailability({ stockMode: 'ON_ORDER', stock: 0 })).toBe('ON_ORDER')
    })
})
