/**
 * Seed-only shapes. They mirror the frontend mock types (src/@types/product.ts in
 * frontend-cups) so the data files can be copied over verbatim.
 */
export type SeedCategorySlug = 'mugs' | 'tees' | 'keychains'

export type SeedProductTag = 'nuevo' | 'bestseller' | 'oferta' | 'personalizable'

export interface SeedCategory {
    slug: SeedCategorySlug
    name: string
    tagline: string
    description: string
    colorHex: string
}

export interface SeedVariant {
    id: string
    label: string
    priceDelta: number
    colorHex?: string
}

export interface SeedProduct {
    id: string
    slug: string
    name: string
    category: SeedCategorySlug
    price: number
    compareAtPrice?: number
    printText: string
    colorHex: string
    description: string
    highlights: string[]
    variants: SeedVariant[]
    rating: number
    reviewCount: number
    tags: SeedProductTag[]
    stock: number
    createdAt: string
}
