import type { Availability, StockMode } from './products.constants.js'

/**
 * Units reported for an ON_ORDER cart line: "bajo pedido" has no stock limit, so the line may
 * hold as many units as an order line accepts (see ORDER_LIMITS.quantity).
 */
export const ON_ORDER_AVAILABLE_UNITS = 99

/** STOCK with units -> IN_STOCK; STOCK without -> OUT_OF_STOCK; ON_ORDER -> ON_ORDER. */
export function productAvailability(product: {
    stockMode: StockMode
    stock: number
}): Availability {
    if (product.stockMode === 'ON_ORDER') return 'ON_ORDER'
    return product.stock > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK'
}

/** A cart line to check: a product and, when it has versions, the chosen one. */
export interface AvailabilityRequestItem {
    productId: string
    variantId?: string
}

/**
 * Live availability of one cart line, in request order. Matches `CartAvailability` in
 * frontend-galpa/src/@types/cart.ts.
 */
export interface AvailabilityDto {
    productId: string
    variantId: string | null
    /**
     * Units left of the variant (or of the product without variants); never negative. ON_ORDER
     * lines always report ON_ORDER_AVAILABLE_UNITS.
     */
    stock: number
    stockMode: StockMode
    isActive: boolean
    /**
     * False when the product or the variant is gone, the variant belongs to another product,
     * or a product with variants was asked without one (checkout refuses all of these).
     */
    exists: boolean
}

export interface AvailabilityProductRow {
    id: string
    stock: number
    stockMode: StockMode
    isActive: boolean
}

export interface AvailabilityVariantRow {
    id: string
    productId: string
    stock: number
}

/**
 * Resolves each requested line against the product and variant rows, with the same rules the
 * checkout applies (see `OrdersService.priceLines`): stock per variant, or per product when it
 * has no variants; ON_ORDER products are always available.
 */
export function resolveAvailability(
    items: readonly AvailabilityRequestItem[],
    products: readonly AvailabilityProductRow[],
    variants: readonly AvailabilityVariantRow[],
): AvailabilityDto[] {
    const productsById = new Map(products.map((product) => [product.id, product]))
    const variantsByProduct = new Map<string, AvailabilityVariantRow[]>()
    for (const variant of variants) {
        const list = variantsByProduct.get(variant.productId) ?? []
        list.push(variant)
        variantsByProduct.set(variant.productId, list)
    }

    return items.map(({ productId, variantId }) => {
        const product = productsById.get(productId)
        const missing: AvailabilityDto = {
            productId,
            variantId: variantId ?? null,
            stock: 0,
            stockMode: product?.stockMode ?? 'STOCK',
            isActive: product?.isActive ?? false,
            exists: false,
        }
        if (!product) return missing
        const stockOf = (units: number) =>
            product.stockMode === 'ON_ORDER' ? ON_ORDER_AVAILABLE_UNITS : Math.max(0, units)
        const own = variantsByProduct.get(product.id) ?? []
        if (variantId === undefined) {
            if (own.length) return missing
            return { ...missing, stock: stockOf(product.stock), exists: true }
        }
        const variant = own.find((candidate) => candidate.id === variantId)
        if (!variant) return missing
        return { ...missing, stock: stockOf(variant.stock), exists: true }
    })
}
