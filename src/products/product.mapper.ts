import type { Product, ProductSpec } from './entities/product.entity.js'
import { productAvailability } from './product-availability.js'
import type { Availability, ProductTag, StockMode } from './products.constants.js'

/** A product loaded with its `variants` and `images` relations (see ProductRepository). */
export type ProductWithRelations = Product

export interface ProductVariantDto {
    id: string
    label: string
    priceDelta: number
    /** Units of this version in stock (the product's `stock` is the sum of its variants). */
    stock: number
    sortOrder: number
}

export interface ProductImageDto {
    id: string
    url: string
    alt: string | null
}

/** Matches `Product` in frontend-galpa/src/@types/product.ts, plus `images`. */
export interface PublicProductDto {
    id: string
    slug: string
    name: string
    category: string
    brand: string
    model: string | null
    sku: string | null
    price: number
    compareAtPrice?: number
    description: string
    highlights: string[]
    variants: ProductVariantDto[]
    tags: ProductTag[]
    stock: number
    stockMode: StockMode
    leadTimeDays: number | null
    availability: Availability
    btu: number | null
    voltage: string | null
    isInverter: boolean | null
    refrigerant: string | null
    specs: ProductSpec[]
    createdAt: string
    images: ProductImageDto[]
}

export interface AdminProductDto extends PublicProductDto {
    isActive: boolean
    updatedAt: string
}

export interface Paginated<T> {
    items: T[]
    page: number
    pageSize: number
    total: number
    totalPages: number
}

export function toPublicProduct(product: ProductWithRelations): PublicProductDto {
    return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        category: product.categorySlug,
        brand: product.brand,
        model: product.model,
        sku: product.sku,
        price: product.price,
        ...(product.compareAtPrice !== null && { compareAtPrice: product.compareAtPrice }),
        description: product.description,
        highlights: product.highlights,
        variants: product.variants.map((variant) => ({
            id: variant.id,
            label: variant.label,
            priceDelta: variant.priceDelta,
            stock: variant.stock,
            sortOrder: variant.sortOrder,
        })),
        tags: product.tags as ProductTag[],
        stock: product.stock,
        stockMode: product.stockMode,
        leadTimeDays: product.leadTimeDays,
        availability: productAvailability(product),
        btu: product.btu,
        voltage: product.voltage,
        isInverter: product.isInverter,
        refrigerant: product.refrigerant,
        specs: product.specs,
        createdAt: product.createdAt.toISOString(),
        images: product.images.map((image) => ({ id: image.id, url: image.url, alt: image.alt })),
    }
}

export function toAdminProduct(product: ProductWithRelations): AdminProductDto {
    return {
        ...toPublicProduct(product),
        isActive: product.isActive,
        updatedAt: product.updatedAt.toISOString(),
    }
}
