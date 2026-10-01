import { normalizeText } from '../common/utils/text.util.js'

export interface DerivedSource {
    name: string
    brand: string
    model: string | null
    sku: string | null
    description: string
    tags: string[]
}

/**
 * Relevance ranking: bestsellers (+10) first, then new products (+4). Ties fall back to the
 * newest product (see `CATALOG_ORDER_BY.relevance`). Stored in `relevance_score` so the
 * database can sort and paginate.
 */
export function computeRelevanceScore(source: Pick<DerivedSource, 'tags'>): number {
    const bestsellerBoost = source.tags.includes('bestseller') ? 10 : 0
    const newBoost = source.tags.includes('nuevo') ? 4 : 0
    return bestsellerBoost + newBoost
}

/** Words a customer may type for a tag: the store shows `bestseller` as "más vendido". */
const TAG_SEARCH_ALIASES: Record<string, string[]> = { bestseller: ['mas', 'vendido'] }

/**
 * Accent-insensitive haystack for search: name, brand, model, SKU, description, tags and their
 * aliases.
 */
export function computeSearchText(source: DerivedSource): string {
    const tagWords = source.tags.flatMap((tag) => [tag, ...(TAG_SEARCH_ALIASES[tag] ?? [])])
    return normalizeText(
        [
            source.name,
            source.brand,
            source.model ?? '',
            source.sku ?? '',
            source.description,
            ...tagWords,
        ].join(' '),
    )
}

export function computeDerivedFields(source: DerivedSource): {
    searchText: string
    relevanceScore: number
} {
    return { searchText: computeSearchText(source), relevanceScore: computeRelevanceScore(source) }
}
