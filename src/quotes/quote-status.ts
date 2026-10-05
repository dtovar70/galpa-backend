/**
 * Quote workflow: BORRADOR → ENVIADA → ACEPTADA → CONVERTIDA, plus RECHAZADA and VENCIDA (set by
 * the expiry job when `validUntil` passes on a sent quote). Their labels, help texts and badge
 * tones live in the `quote_statuses` table (`QuoteStatusCatalogService`), whose codes must match
 * this list exactly (checked at startup).
 */
export const QUOTE_STATUSES = [
    'BORRADOR',
    'ENVIADA',
    'ACEPTADA',
    'CONVERTIDA',
    'RECHAZADA',
    'VENCIDA',
] as const

export type QuoteStatus = (typeof QUOTE_STATUSES)[number]

/** Who moves a quote: an admin (status endpoint, send, convert) or the expiry job. */
export type QuoteActor = 'admin' | 'system'

export interface QuoteTransitionRule {
    to: QuoteStatus
    actors: readonly QuoteActor[]
    /** A reason/note is mandatory. */
    requiresReason?: boolean
}

/**
 * Every allowed status change. ENVIADA is reached by sending it (email) or marking it sent after
 * sharing it by WhatsApp; CONVERTIDA only by converting it into an order; VENCIDA only by the job.
 * An expired quote goes back to BORRADOR to be updated and sent again.
 */
export const QUOTE_TRANSITIONS: Record<QuoteStatus, readonly QuoteTransitionRule[]> = {
    BORRADOR: [{ to: 'ENVIADA', actors: ['admin'] }],
    ENVIADA: [
        { to: 'ACEPTADA', actors: ['admin'] },
        { to: 'RECHAZADA', actors: ['admin'] },
        { to: 'VENCIDA', actors: ['system'] },
    ],
    ACEPTADA: [{ to: 'RECHAZADA', actors: ['admin'] }],
    CONVERTIDA: [],
    RECHAZADA: [],
    VENCIDA: [{ to: 'BORRADOR', actors: ['admin'] }],
}

/** The quote's lines and conditions may still change. */
export const EDITABLE_QUOTE_STATUSES: readonly QuoteStatus[] = ['BORRADOR', 'ENVIADA']
/** The quote may be emailed (again). */
export const SENDABLE_QUOTE_STATUSES: readonly QuoteStatus[] = ['BORRADOR', 'ENVIADA']
/** The quote may become an order. */
export const CONVERTIBLE_QUOTE_STATUSES: readonly QuoteStatus[] = [
    'BORRADOR',
    'ENVIADA',
    'ACEPTADA',
]

/** Only drafts may be deleted. */
export const DELETABLE_QUOTE_STATUSES: readonly QuoteStatus[] = ['BORRADOR']

export function isQuoteStatus(value: string): value is QuoteStatus {
    return (QUOTE_STATUSES as readonly string[]).includes(value)
}

/** The rule behind a move, when this actor may make it. */
export function findQuoteTransition(
    from: QuoteStatus,
    to: QuoteStatus,
    actor: QuoteActor,
): QuoteTransitionRule | undefined {
    return QUOTE_TRANSITIONS[from].find((rule) => rule.to === to && rule.actors.includes(actor))
}

export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus, actor: QuoteActor): boolean {
    return findQuoteTransition(from, to, actor) !== undefined
}

/**
 * Moves the admin may make by hand from `from` (the "Cambiar estado" dialog). Sending and
 * converting have their own endpoints, so a status only reached through them is not listed.
 */
export function manualQuoteTransitions(from: QuoteStatus): QuoteTransitionRule[] {
    return QUOTE_TRANSITIONS[from].filter((rule) => rule.actors.includes('admin'))
}

/** What the admin may do with a quote in this status (drives the editor's buttons). */
export interface QuoteCapabilities {
    canEdit: boolean
    canConvert: boolean
    canDelete: boolean
    /** Emailing it also needs the customer's email. */
    canSend: boolean
}

export function quoteCapabilities(quote: {
    status: QuoteStatus
    customerEmail: string | null
}): QuoteCapabilities {
    return {
        canEdit: EDITABLE_QUOTE_STATUSES.includes(quote.status),
        canConvert: CONVERTIBLE_QUOTE_STATUSES.includes(quote.status),
        canDelete: DELETABLE_QUOTE_STATUSES.includes(quote.status),
        canSend: SENDABLE_QUOTE_STATUSES.includes(quote.status) && Boolean(quote.customerEmail),
    }
}

/** "No se puede pasar una cotización de «Borrador» a «Aceptada»." `label` names a status. */
export function invalidQuoteTransitionMessage(
    from: QuoteStatus,
    to: QuoteStatus,
    label: (status: QuoteStatus) => string,
): string {
    return `No se puede pasar una cotización de «${label(from)}» a «${label(to)}».`
}
