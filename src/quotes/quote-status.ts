/**
 * Quote workflow: BORRADOR → ENVIADA → ACEPTADA → CONVERTIDA, plus RECHAZADA and VENCIDA (set by
 * the expiry job when `validUntil` passes on a sent quote).
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

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
    BORRADOR: 'Borrador',
    ENVIADA: 'Enviada',
    ACEPTADA: 'Aceptada',
    CONVERTIDA: 'Convertida en pedido',
    RECHAZADA: 'Rechazada',
    VENCIDA: 'Vencida',
}

/** Who moves a quote: an admin (status endpoint, send, convert) or the expiry job. */
export type QuoteActor = 'admin' | 'system'

interface QuoteTransitionRule {
    to: QuoteStatus
    actors: readonly QuoteActor[]
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

export function isQuoteStatus(value: string): value is QuoteStatus {
    return (QUOTE_STATUSES as readonly string[]).includes(value)
}

export function canTransitionQuote(from: QuoteStatus, to: QuoteStatus, actor: QuoteActor): boolean {
    return QUOTE_TRANSITIONS[from].some((rule) => rule.to === to && rule.actors.includes(actor))
}

/** "No se puede pasar una cotización de «Borrador» a «Aceptada»." */
export function invalidQuoteTransitionMessage(from: QuoteStatus, to: QuoteStatus): string {
    return `No se puede pasar una cotización de «${QUOTE_STATUS_LABELS[from]}» a «${QUOTE_STATUS_LABELS[to]}».`
}
