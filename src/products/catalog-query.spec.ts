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
                category: 'mugs',
                minPrice: 10,
                maxPrice: 20,
                tags: ['oferta', 'nuevo'],
            }),
        ).toEqual([
            ACTIVE,
            { clause: 'product.categorySlug = :category', params: { category: 'mugs' } },
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
        expect(buildCatalogConditions({ search: '  Mamá   JEFA ' }).slice(1)).toEqual([
            { clause: 'product.searchText LIKE :search0', params: { search0: '%mama%' } },
            { clause: 'product.searchText LIKE :search1', params: { search1: '%jefa%' } },
        ])
    })

    it('escapes LIKE wildcards so they match literally', () => {
        expect(buildCatalogConditions({ search: '100%_x' })[1]?.params).toEqual({
            search0: '%100\\%\\_x%',
        })
    })

    it('never interpolates user input into the SQL clause', () => {
        const conditions = buildCatalogConditions({
            category: "mugs' OR 1=1 --",
            search: "'; DROP TABLE products; --",
        })
        for (const { clause } of conditions) {
            expect(clause).not.toMatch(/DROP|OR 1=1/)
        }
    })

    it('ignores a blank search', () => {
        expect(buildCatalogConditions({ search: '   ' })).toEqual([ACTIVE])
    })
})

describe('CATALOG_ORDER_BY', () => {
    it('mirrors the frontend mock comparators with a stable tie-breaker', () => {
        expect(CATALOG_ORDER_BY.relevance).toEqual([
            ['product.relevanceScore', 'DESC'],
            ['product.id', 'ASC'],
        ])
        expect(CATALOG_ORDER_BY['price-asc'][0]).toEqual(['product.price', 'ASC'])
        expect(CATALOG_ORDER_BY['price-desc'][0]).toEqual(['product.price', 'DESC'])
        expect(CATALOG_ORDER_BY.newest[0]).toEqual(['product.createdAt', 'DESC'])
        expect(CATALOG_ORDER_BY.rating.slice(0, 2)).toEqual([
            ['product.rating', 'DESC'],
            ['product.reviewCount', 'DESC'],
        ])
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

    it('clamps out-of-range pages like the mock', () => {
        expect(resolvePageWindow(30, 99, 12).page).toBe(3)
        expect(resolvePageWindow(0, 5, 12)).toMatchObject({ page: 1, totalPages: 1, skip: 0 })
    })
})

describe('derived product fields', () => {
    it('scores bestsellers, then new products, then rating', () => {
        expect(computeRelevanceScore({ tags: ['bestseller', 'nuevo'], rating: 4.9 })).toBeCloseTo(
            18.9,
        )
        expect(computeRelevanceScore({ tags: ['oferta'], rating: 4.2 })).toBeCloseTo(4.2)
    })

    it('builds a normalized search haystack including tags', () => {
        expect(
            computeSearchText({
                name: 'Taza Café Primero',
                description: 'Cerámica',
                printText: '¡Sorpresa!',
                tags: ['oferta'],
            }),
        ).toBe('taza cafe primero ceramica ¡sorpresa! oferta')
    })
})
