import type { Product } from './entities/product.entity.js'
import type { ProductTag } from './products.constants.js'

/** A product loaded with its `variants` and `images` relations (see ProductRepository). */
export type ProductWithRelations = Product

export interface ProductVariantDto {
    id: string
    label: string
    priceDelta: number
    colorHex?: string
    /** Units of this version in stock (the product's `stock` is the sum of its variants). */
    stock: number
}

export interface ProductImageDto {
    id: string
    url: string
    alt: string | null
}

/** Matches `Product` in frontend-cups/src/@types/product.ts, plus `images`. */
export interface PublicProductDto {
    id: string
    slug: string
    name: string
    category: string
    price: number
    compareAtPrice?: number
    printText: string
    colorHex: string
    description: string
    highlights: string[]
    variants: ProductVariantDto[]
    tags: ProductTag[]
    stock: number
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
        price: product.price,
        ...(product.compareAtPrice !== null && { compareAtPrice: product.compareAtPrice }),
        printText: product.printText,
        colorHex: product.colorHex,
        description: product.description,
        highlights: product.highlights,
        variants: product.variants.map((variant) => ({
            id: variant.id,
            label: variant.label,
            priceDelta: variant.priceDelta,
            ...(variant.colorHex !== null && { colorHex: variant.colorHex }),
            stock: variant.stock,
        })),
        tags: product.tags as ProductTag[],
        stock: product.stock,
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
