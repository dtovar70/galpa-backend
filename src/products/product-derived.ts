import { normalizeText } from '../common/utils/text.util.js'

export interface DerivedSource {
    name: string
    description: string
    printText: string
    tags: string[]
    rating: number
}

/**
 * Same ranking as the frontend mock (products.api.ts): bestsellers first, then new
 * products, then rating. Stored in `relevance_score` so the database can sort and paginate.
 */
export function computeRelevanceScore(source: Pick<DerivedSource, 'tags' | 'rating'>): number {
    const bestsellerBoost = source.tags.includes('bestseller') ? 10 : 0
    const newBoost = source.tags.includes('nuevo') ? 4 : 0
    return bestsellerBoost + newBoost + source.rating
}

/** Accent-insensitive haystack for search (name, description, printText, tags). */
export function computeSearchText(source: Omit<DerivedSource, 'rating'>): string {
    return normalizeText(
        [source.name, source.description, source.printText, ...source.tags].join(' '),
    )
}

export function computeDerivedFields(source: DerivedSource): {
    searchText: string
    relevanceScore: number
} {
    return { searchText: computeSearchText(source), relevanceScore: computeRelevanceScore(source) }
}
