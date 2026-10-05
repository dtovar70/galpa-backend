import type { QuoteStatusLabeler } from '../catalogs/quote-status-catalog.service.js'
import type { Quote } from './entities/quote.entity.js'
import type { QuoteItem } from './entities/quote-item.entity.js'
import {
    manualQuoteTransitions,
    quoteCapabilities,
    type QuoteCapabilities,
    type QuoteStatus,
} from './quote-status.js'

export interface QuoteItemDto {
    id: string
    productId: string | null
    /** The chosen version of a product with variants; null otherwise. */
    variantId: string | null
    productSlug: string | null
    description: string
    brand: string | null
    model: string | null
    quantity: number
    unitPrice: number
    lineTotal: number
    sortOrder: number
}

/** A status the admin may move the quote to by hand ("Cambiar estado"). */
export interface QuoteTransitionDto {
    status: QuoteStatus
    /** The catalog's admin label. */
    label: string
    requiresReason: boolean
}

/**
 * A quote as the admin sees it (amounts in USD; `totalBs` is a reference). The status label,
 * the manual moves and the `can*` flags come from the API, so the back office holds no status
 * rules of its own.
 */
export interface QuoteDto extends QuoteCapabilities {
    id: string
    code: string
    status: QuoteStatus
    statusLabel: string
    statusReason: string | null
    customerName: string
    customerEmail: string | null
    customerPhone: string | null
    customerIdNumber: string | null
    customerCompany: string | null
    notes: string
    terms: string
    validUntil: string
    items: QuoteItemDto[]
    subtotal: number
    discount: number
    total: number
    exchangeRate: number | null
    totalBs: number | null
    createdBy: { id: string; name: string } | null
    sentAt: string | null
    convertedOrderCode: string | null
    createdAt: string
    updatedAt: string
    allowedTransitions: QuoteTransitionDto[]
}

export interface QuoteListDto {
    items: QuoteDto[]
    total: number
    page: number
    pageSize: number
}

function toItem(item: QuoteItem): QuoteItemDto {
    return {
        id: item.id,
        productId: item.productId,
        variantId: item.variantId,
        productSlug: item.productSlug,
        description: item.description,
        brand: item.brand,
        model: item.model,
        quantity: item.quantity,
        unitPrice: item.unitPriceUsd,
        lineTotal: item.lineTotalUsd,
        sortOrder: item.sortOrder,
    }
}

export function sortedQuoteItems(quote: Pick<Quote, 'items'>): QuoteItem[] {
    return [...(quote.items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)
}

/** `label` names a status (the catalog's admin label). */
export function toQuoteDto(quote: Quote, label: QuoteStatusLabeler): QuoteDto {
    return {
        id: quote.id,
        code: quote.code,
        status: quote.status,
        statusLabel: label(quote.status),
        statusReason: quote.statusReason,
        customerName: quote.customerName,
        customerEmail: quote.customerEmail,
        customerPhone: quote.customerPhone,
        customerIdNumber: quote.customerIdNumber,
        customerCompany: quote.customerCompany,
        notes: quote.notes,
        terms: quote.terms,
        validUntil: quote.validUntil,
        items: sortedQuoteItems(quote).map(toItem),
        subtotal: quote.subtotalUsd,
        discount: quote.discountUsd,
        total: quote.totalUsd,
        exchangeRate: quote.exchangeRate,
        totalBs: quote.totalBs,
        createdBy: quote.createdBy ? { id: quote.createdBy.id, name: quote.createdBy.name } : null,
        sentAt: quote.sentAt?.toISOString() ?? null,
        convertedOrderCode: quote.convertedOrderCode,
        createdAt: quote.createdAt.toISOString(),
        updatedAt: quote.updatedAt.toISOString(),
        allowedTransitions: manualQuoteTransitions(quote.status).map((rule) => ({
            status: rule.to,
            label: label(rule.to),
            requiresReason: rule.requiresReason === true,
        })),
        ...quoteCapabilities(quote),
    }
}
