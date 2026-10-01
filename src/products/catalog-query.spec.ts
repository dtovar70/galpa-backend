import { buildCatalogConditions, CATALOG_ORDER_BY, resolvePageWindow } from './catalog-query.js'
import { computeRelevanceScore, computeSearchText } from './product-derived.js'

const ACTIVE = { clause: 'product.isActive = :isActive', params: { isActive: true } }

describe('buildCatalogConditions', () => {
    it('always restricts the public catalog to active products', () => {
        expect(buildCatalogConditions({})).toEqual([ACTIVE])
    })

    it('maps category, price range and tags to parameterized clauses', () => {
        expect(
            buildCatalogConditions({
                category: 'aires-residenciales',
                minPrice: 10,
                maxPrice: 20,
                tags: ['oferta', 'nuevo'],
            }),
        ).toEqual([
            ACTIVE,
            {
                clause: 'product.categorySlug = :category',
                params: { category: 'aires-residenciales' },
            },
            { clause: 'product.price >= :minPrice', params: { minPrice: 10 } },
            { clause: 'product.price <= :maxPrice', params: { maxPrice: 20 } },
            {
                clause: 'product.tags @> CAST(:tags AS text[])',
                params: { tags: ['oferta', 'nuevo'] },
            },
        ])
    })

    it('supports an open-ended price range (including 0)', () => {
        expect(buildCatalogConditions({ minPrice: 0 })).toContainEqual({
            clause: 'product.price >= :minPrice',
            params: { minPrice: 0 },
        })
        expect(buildCatalogConditions({ maxPrice: 15 })).toHaveLength(2)
    })

    it('splits the search into accent-insensitive AND terms', () => {
        expect(buildCatalogConditions({ search: '  Calefacción   INVERTER ' }).slice(1)).toEqual([
            { clause: 'product.searchText LIKE :search0', params: { search0: '%calefaccion%' } },
            { clause: 'product.searchText LIKE :search1', params: { search1: '%inverter%' } },
        ])
    })

    it('escapes LIKE wildcards so they match literally', () => {
        expect(buildCatalogConditions({ search: '100%_x' })[1]?.params).toEqual({
            search0: '%100\\%\\_x%',
        })
    })

    it('never interpolates user input into the SQL clause', () => {
        const conditions = buildCatalogConditions({
            category: "aires' OR 1=1 --",
            search: "'; DROP TABLE products; --",
        })
        for (const { clause } of conditions) {
            expect(clause).not.toMatch(/DROP|OR 1=1/)
        }
    })

    it('maps brands, availability, BTU range, voltage and inverter (case-insensitive text)', () => {
        expect(
            buildCatalogConditions({
                brand: ['Daikin', 'LG'],
                availability: 'IN_STOCK',
                btuMin: 9000,
                btuMax: 18000,
                voltage: '220v',
                inverter: false,
            }).slice(1),
        ).toEqual([
            {
                clause: 'LOWER(product.brand) IN (:...brands)',
                params: { brands: ['daikin', 'lg'] },
            },
            {
                clause: 'product.stockMode = :inStock AND product.stock > 0',
                params: { inStock: 'STOCK' },
            },
            { clause: 'product.btu >= :btuMin', params: { btuMin: 9000 } },
            { clause: 'product.btu <= :btuMax', params: { btuMax: 18000 } },
            { clause: 'LOWER(product.voltage) = :voltage', params: { voltage: '220v' } },
            { clause: 'product.isInverter = :inverter', params: { inverter: false } },
        ])
        expect(buildCatalogConditions({ availability: 'ON_ORDER' })[1]).toEqual({
            clause: 'product.stockMode = :onOrder',
            params: { onOrder: 'ON_ORDER' },
        })
    })

    it('ignores a blank search', () => {
        expect(buildCatalogConditions({ search: '   ' })).toEqual([ACTIVE])
    })
})

describe('CATALOG_ORDER_BY', () => {
    it('sorts by relevance, price or date with a stable tie-breaker', () => {
        expect(CATALOG_ORDER_BY.relevance).toEqual([
            ['product.relevanceScore', 'DESC'],
            ['product.createdAt', 'DESC'],
            ['product.id', 'ASC'],
        ])
        expect(CATALOG_ORDER_BY['price-asc'][0]).toEqual(['product.price', 'ASC'])
        expect(CATALOG_ORDER_BY['price-desc'][0]).toEqual(['product.price', 'DESC'])
        expect(CATALOG_ORDER_BY.newest[0]).toEqual(['product.createdAt', 'DESC'])
    })
})

describe('resolvePageWindow', () => {
    it('computes skip and total pages', () => {
        expect(resolvePageWindow(30, 2, 12)).toEqual({
            page: 2,
            pageSize: 12,
            total: 30,
            totalPages: 3,
            skip: 12,
        })
    })

    it('clamps out-of-range pages', () => {
        expect(resolvePageWindow(30, 99, 12).page).toBe(3)
        expect(resolvePageWindow(0, 5, 12)).toMatchObject({ page: 1, totalPages: 1, skip: 0 })
    })
})

describe('derived product fields', () => {
    it('scores bestsellers (+10) and new products (+4) only', () => {
        expect(computeRelevanceScore({ tags: ['bestseller', 'nuevo'] })).toBe(14)
        expect(computeRelevanceScore({ tags: ['bestseller'] })).toBe(10)
        expect(computeRelevanceScore({ tags: ['nuevo'] })).toBe(4)
        expect(computeRelevanceScore({ tags: ['oferta'] })).toBe(0)
    })

    it('builds a normalized search haystack with brand, model, SKU and tags', () => {
        expect(
            computeSearchText({
                name: 'Split Inverter 12.000 BTU',
                brand: 'LG',
                model: 'S4-Q12JA',
                sku: 'LG-S4Q12',
                description: 'Compresor de última generación',
                tags: ['oferta'],
            }),
        ).toBe(
            'split inverter 12.000 btu lg s4-q12ja lg-s4q12 compresor de ultima generacion oferta',
        )
    })

    it('adds "más vendido" for bestsellers, the words the store shows', () => {
        expect(
            computeSearchText({
                name: 'Capacitor',
                brand: 'Packard',
                model: null,
                sku: null,
                description: '',
                tags: ['bestseller'],
            }),
        ).toContain('bestseller mas vendido')
    })
})
