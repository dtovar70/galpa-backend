import { prettifyStatusCode } from '../catalogs/order-status-catalog.service.js'
import {
    canTransitionQuote,
    CONVERTIBLE_QUOTE_STATUSES,
    EDITABLE_QUOTE_STATUSES,
    invalidQuoteTransitionMessage,
    manualQuoteTransitions,
    QUOTE_STATUSES,
    QUOTE_TRANSITIONS,
    quoteCapabilities,
} from './quote-status.js'

describe('quote transition map', () => {
    it('follows BORRADOR → ENVIADA → ACEPTADA, with rejection along the way', () => {
        expect(canTransitionQuote('BORRADOR', 'ENVIADA', 'admin')).toBe(true)
        expect(canTransitionQuote('ENVIADA', 'ACEPTADA', 'admin')).toBe(true)
        expect(canTransitionQuote('ENVIADA', 'RECHAZADA', 'admin')).toBe(true)
        expect(canTransitionQuote('ACEPTADA', 'RECHAZADA', 'admin')).toBe(true)
        expect(canTransitionQuote('BORRADOR', 'ACEPTADA', 'admin')).toBe(false)
    })

    it('only lets the job expire a sent quote, and reopens an expired one as a draft', () => {
        expect(canTransitionQuote('ENVIADA', 'VENCIDA', 'system')).toBe(true)
        expect(canTransitionQuote('ENVIADA', 'VENCIDA', 'admin')).toBe(false)
        expect(canTransitionQuote('ACEPTADA', 'VENCIDA', 'system')).toBe(false)
        expect(canTransitionQuote('VENCIDA', 'BORRADOR', 'admin')).toBe(true)
    })

    it('never reaches CONVERTIDA through a plain transition; closed quotes stay closed', () => {
        for (const from of QUOTE_STATUSES) {
            expect(canTransitionQuote(from, 'CONVERTIDA', 'admin')).toBe(false)
        }
        expect(QUOTE_TRANSITIONS.CONVERTIDA).toEqual([])
        expect(QUOTE_TRANSITIONS.RECHAZADA).toEqual([])
        for (const rules of Object.values(QUOTE_TRANSITIONS)) {
            for (const rule of rules) expect(QUOTE_STATUSES).toContain(rule.to)
        }
    })

    it('edits drafts and sent quotes; converts until accepted', () => {
        expect(EDITABLE_QUOTE_STATUSES).toEqual(['BORRADOR', 'ENVIADA'])
        expect(CONVERTIBLE_QUOTE_STATUSES).toEqual(['BORRADOR', 'ENVIADA', 'ACEPTADA'])
    })

    it('lists only the moves an admin may make by hand', () => {
        const targets = (from: (typeof QUOTE_STATUSES)[number]) =>
            manualQuoteTransitions(from).map((rule) => rule.to)
        expect(targets('BORRADOR')).toEqual(['ENVIADA'])
        expect(targets('ENVIADA')).toEqual(['ACEPTADA', 'RECHAZADA'])
        expect(targets('ACEPTADA')).toEqual(['RECHAZADA'])
        expect(targets('VENCIDA')).toEqual(['BORRADOR'])
        expect(targets('CONVERTIDA')).toEqual([])
        expect(targets('RECHAZADA')).toEqual([])
    })

    it('derives what the admin may do from the status (and the email to send it)', () => {
        const email = 'compras@losandes.com'
        expect(quoteCapabilities({ status: 'BORRADOR', customerEmail: email })).toEqual({
            canEdit: true,
            canConvert: true,
            canDelete: true,
            canSend: true,
        })
        expect(quoteCapabilities({ status: 'ENVIADA', customerEmail: null })).toEqual({
            canEdit: true,
            canConvert: true,
            canDelete: false,
            canSend: false,
        })
        expect(quoteCapabilities({ status: 'ACEPTADA', customerEmail: email })).toEqual({
            canEdit: false,
            canConvert: true,
            canDelete: false,
            canSend: false,
        })
        for (const status of ['CONVERTIDA', 'RECHAZADA', 'VENCIDA'] as const) {
            expect(quoteCapabilities({ status, customerEmail: email })).toEqual({
                canEdit: false,
                canConvert: false,
                canDelete: false,
                canSend: false,
            })
        }
    })

    it('explains an invalid move in Spanish, with the catalog labels', () => {
        expect(invalidQuoteTransitionMessage('BORRADOR', 'ACEPTADA', prettifyStatusCode)).toBe(
            'No se puede pasar una cotización de «Borrador» a «Aceptada».',
        )
    })
})
