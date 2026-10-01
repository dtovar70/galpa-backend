import { normalizeText } from '../common/utils/text.util.js'

export interface DerivedSource {
    name: string
    description: string
    printText: string
    tags: string[]
}

/**
 * Same ranking as the frontend mock (products.api.ts): bestsellers (+10) first, then new
 * products (+4). Ties fall back to the newest product (see `CATALOG_ORDER_BY.relevance`).
 * The shop has no reviews, so the seeded `rating` column is deliberately ignored. Stored in
 * `relevance_score` so the database can sort and paginate.
 */
export function computeRelevanceScore(source: Pick<DerivedSource, 'tags'>): number {
    const bestsellerBoost = source.tags.includes('bestseller') ? 10 : 0
    const newBoost = source.tags.includes('nuevo') ? 4 : 0
    return bestsellerBoost + newBoost
}

/** Words a customer may type for a tag: the store shows `bestseller` as "favorito". */
const TAG_SEARCH_ALIASES: Record<string, string> = { bestseller: 'favorito' }

/** Accent-insensitive haystack for search (name, description, printText, tags and aliases). */
export function computeSearchText(source: DerivedSource): string {
    const tagWords = source.tags.flatMap((tag) =>
        TAG_SEARCH_ALIASES[tag] ? [tag, TAG_SEARCH_ALIASES[tag]] : [tag],
    )
    return normalizeText([source.name, source.description, source.printText, ...tagWords].join(' '))
}

export function computeDerivedFields(source: DerivedSource): {
    searchText: string
    relevanceScore: number
} {
    return { searchText: computeSearchText(source), relevanceScore: computeRelevanceScore(source) }
}
