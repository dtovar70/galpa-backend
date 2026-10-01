import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm'
import { normalizeText } from '../common/utils/text.util.js'
import type { AvailabilityFilter, ProductTag, SortOption } from './products.constants.js'

/** Query alias used for the `Product` entity in every catalog query. */
export const PRODUCT_ALIAS = 'product'

export interface CatalogFilters {
    category?: string
    search?: string
    minPrice?: number
    maxPrice?: number
    tags?: ProductTag[]
    /** Any of these brands (exact, case-insensitive). */
    brand?: string[]
    availability?: AvailabilityFilter
    btuMin?: number
    btuMax?: number
    voltage?: string
    inverter?: boolean
}

/** A parameterized WHERE fragment. User input only ever travels in `params`. */
export interface Condition {
    clause: string
    params: Record<string, unknown>
}

export type OrderBy = [path: string, direction: 'ASC' | 'DESC'][]

/** Escapes LIKE wildcards so user input is matched literally. */
function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** Every search term must appear in the normalized haystack (AND semantics). */
export function buildSearchConditions(search?: string): Condition[] {
    if (!search) return []
    return normalizeText(search)
        .split(/\s+/)
        .filter(Boolean)
        .map((term, index) => ({
            clause: `${PRODUCT_ALIAS}.searchText LIKE :search${index}`,
            params: { [`search${index}`]: `%${escapeLike(term)}%` },
        }))
}

/** Public catalog filter. Only active products are ever visible. */
export function buildCatalogConditions(filters: CatalogFilters): Condition[] {
    const conditions: Condition[] = [
        { clause: `${PRODUCT_ALIAS}.isActive = :isActive`, params: { isActive: true } },
    ]

    if (filters.category) {
        conditions.push({
            clause: `${PRODUCT_ALIAS}.categorySlug = :category`,
            params: { category: filters.category },
        })
    }
    if (filters.minPrice !== undefined) {
        conditions.push({
            clause: `${PRODUCT_ALIAS}.price >= :minPrice`,
            params: { minPrice: filters.minPrice },
        })
    }
    if (filters.maxPrice !== undefined) {
        conditions.push({
            clause: `${PRODUCT_ALIAS}.price <= :maxPrice`,
            params: { maxPrice: filters.maxPrice },
        })
    }
    if (filters.tags?.length) {
        conditions.push({
            clause: `${PRODUCT_ALIAS}.tags @> CAST(:tags AS text[])`,
            params: { tags: filters.tags },
        })
    }
    if (filters.brand?.length) {
        conditions.push({
            clause: `LOWER(${PRODUCT_ALIAS}.brand) IN (:...brands)`,
            params: { brands: filters.brand.map((brand) => brand.toLowerCase()) },
        })
    }
    if (filters.availability === 'ON_ORDER') {
        conditions.push({
            clause: `${PRODUCT_ALIAS}.stockMode = :onOrder`,
            params: { onOrder: 'ON_ORDER' },
        })
    } else if (filters.availability === 'IN_STOCK') {
        conditions.push({
            clause: `${PRODUCT_ALIAS}.stockMode = :inStock AND ${PRODUCT_ALIAS}.stock > 0`,
            params: { inStock: 'STOCK' },
        })
    }
    if (filters.btuMin !== undefined) {
        conditions.push({
            clause: `${PRODUCT_ALIAS}.btu >= :btuMin`,
            params: { btuMin: filters.btuMin },
        })
    }
    if (filters.btuMax !== undefined) {
        conditions.push({
            clause: `${PRODUCT_ALIAS}.btu <= :btuMax`,
            params: { btuMax: filters.btuMax },
        })
    }
    if (filters.voltage) {
        conditions.push({
            clause: `LOWER(${PRODUCT_ALIAS}.voltage) = :voltage`,
            params: { voltage: filters.voltage.toLowerCase() },
        })
    }
    if (filters.inverter !== undefined) {
        conditions.push({
            clause: `${PRODUCT_ALIAS}.isInverter = :inverter`,
            params: { inverter: filters.inverter },
        })
    }

    return [...conditions, ...buildSearchConditions(filters.search)]
}

/**
 * Catalog sorts; `id` is the final deterministic tie-breaker.
 * Relevance ties (same tags) show the newest product first.
 */
export const CATALOG_ORDER_BY: Record<SortOption, OrderBy> = {
    relevance: [
        [`${PRODUCT_ALIAS}.relevanceScore`, 'DESC'],
        [`${PRODUCT_ALIAS}.createdAt`, 'DESC'],
        [`${PRODUCT_ALIAS}.id`, 'ASC'],
    ],
    'price-asc': [
        [`${PRODUCT_ALIAS}.price`, 'ASC'],
        [`${PRODUCT_ALIAS}.id`, 'ASC'],
    ],
    'price-desc': [
        [`${PRODUCT_ALIAS}.price`, 'DESC'],
        [`${PRODUCT_ALIAS}.id`, 'ASC'],
    ],
    newest: [
        [`${PRODUCT_ALIAS}.createdAt`, 'DESC'],
        [`${PRODUCT_ALIAS}.id`, 'ASC'],
    ],
}

export function applyConditions<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    conditions: Condition[],
): SelectQueryBuilder<T> {
    for (const { clause, params } of conditions) query.andWhere(clause, params)
    return query
}

export function applyOrderBy<T extends ObjectLiteral>(
    query: SelectQueryBuilder<T>,
    orderBy: OrderBy,
): SelectQueryBuilder<T> {
    orderBy.forEach(([path, direction], index) =>
        index === 0 ? query.orderBy(path, direction) : query.addOrderBy(path, direction),
    )
    return query
}

export interface PageWindow {
    page: number
    pageSize: number
    total: number
    totalPages: number
    skip: number
}

/** Out-of-range pages snap to the nearest valid page. */
export function resolvePageWindow(total: number, page: number, pageSize: number): PageWindow {
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const safePage = Math.min(Math.max(1, page), totalPages)
    return { page: safePage, pageSize, total, totalPages, skip: (safePage - 1) * pageSize }
}
