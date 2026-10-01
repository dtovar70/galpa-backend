/** Seed-only shapes for the demo catalog (see categories.data.ts and products.data.ts). */
export type SeedCategorySlug =
    'aires-residenciales' | 'aires-comerciales' | 'repuestos' | 'accesorios'

export type SeedProductTag = 'nuevo' | 'bestseller' | 'oferta'

export interface SeedCategory {
    slug: SeedCategorySlug
    name: string
    tagline: string
    description: string
    colorHex: string
    /** Lucide icon name. */
    icon: string
}

export interface SeedVariant {
    id: string
    label: string
    priceDelta: number
    stock: number
}

export interface SeedProduct {
    id: string
    slug: string
    name: string
    category: SeedCategorySlug
    brand: string
    model: string | null
    sku: string
    price: number
    compareAtPrice?: number
    stockMode: 'STOCK' | 'ON_ORDER'
    /** Units for a product without variants (ignored with variants or ON_ORDER). */
    stock: number
    leadTimeDays: number | null
    btu: number | null
    voltage: string | null
    isInverter: boolean | null
    refrigerant: string | null
    description: string
    highlights: string[]
    specs: { label: string; value: string }[]
    variants: SeedVariant[]
    tags: SeedProductTag[]
    createdAt: string
}
