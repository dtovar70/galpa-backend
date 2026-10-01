import type { EntityManager } from 'typeorm'
import { readStock, resolveStockUnit, type LockedStock } from '../products/product-stock.js'
import type { StockConflict, StockConflictLine } from './entities/order.entity.js'

/** A conflict line with the stock there is now (`available`), not when it was detected. */
export interface LiveStockConflictLine extends StockConflictLine {
    /** The units this order still misses are more than what is in stock now. */
    stillShort: boolean
}

/**
 * A stock conflict as it stands now. The stored conflict is a snapshot of the moment the order
 * could not take its stock back; the owner may have restocked since, so every decision and
 * every screen reads it through `liveStockConflict`.
 */
export interface LiveStockConflict extends StockConflict {
    lines: LiveStockConflictLine[]
    /** Some line is still short: confirming the payment needs an acknowledgement. */
    stillShort: boolean
}

/** The products whose stock a conflict depends on. */
export function stockConflictProductIds(conflict: StockConflict): string[] {
    return conflict.lines.flatMap((line) => (line.productId ? [line.productId] : []))
}

/**
 * Refreshes an open conflict with the given stock (locked when the result decides anything):
 * per line, the missing units (`requested - reserved`) against what its variant (or its product
 * without variants) has now. A deleted product or variant has nothing. A resolved conflict is
 * history: it is returned as recorded, never short.
 */
export function liveStockConflict(conflict: StockConflict, stock: LockedStock): LiveStockConflict {
    if (conflict.resolvedAt) {
        return {
            ...conflict,
            lines: conflict.lines.map((line) => ({ ...line, stillShort: false })),
            stillShort: false,
        }
    }
    const lines = conflict.lines.map((line) => {
        // Lines recorded before stock was per variant only resolve for products without variants.
        const unit = resolveStockUnit(stock, line.productId, line.variantId ?? null)
        const available = unit?.available ?? 0
        return { ...line, available, stillShort: line.requested - line.reserved > available }
    })
    return { ...conflict, lines, stillShort: lines.some((line) => line.stillShort) }
}

/** `liveStockConflict` with the current stock, read without locks (for display only). */
export async function readLiveStockConflict(
    manager: EntityManager,
    conflict: StockConflict,
): Promise<LiveStockConflict> {
    const stock = conflict.resolvedAt
        ? { products: new Map(), variants: new Map() }
        : await readStock(manager, stockConflictProductIds(conflict))
    return liveStockConflict(conflict, stock)
}
