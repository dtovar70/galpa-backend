import { Quote } from './entities/quote.entity.js'
import { toQuoteDto } from './quote.mapper.js'
import type { QuoteStatus } from './quote-status.js'

const LABELS: Record<QuoteStatus, string> = {
    BORRADOR: 'En preparación',
    ENVIADA: 'Enviada',
    ACEPTADA: 'Aprobada',
    CONVERTIDA: 'Convertida en pedido',
    RECHAZADA: 'Rechazada',
    VENCIDA: 'Vencida',
}

function quote(status: QuoteStatus, customerEmail: string | null = 'compras@losandes.com'): Quote {
    return Object.assign(new Quote(), {
        id: 'q1',
        code: 'COT-000045',
        status,
        statusReason: null,
        customerName: 'Hotel Los Andes',
        customerEmail,
        customerPhone: null,
        customerIdNumber: null,
        customerCompany: null,
        notes: '',
        terms: '',
        validUntil: '2999-12-31',
        subtotalUsd: 100,
        discountUsd: 0,
        totalUsd: 100,
        exchangeRate: null,
        totalBs: null,
        createdBy: null,
        sentAt: null,
        convertedOrderCode: null,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        items: [],
    })
}

describe('toQuoteDto', () => {
    const label = (code: QuoteStatus) => LABELS[code]

    it('labels the status and its manual moves from the catalog', () => {
        const dto = toQuoteDto(quote('ENVIADA'), label)
        expect(dto.statusLabel).toBe('Enviada')
        expect(dto.allowedTransitions).toEqual([
            { status: 'ACEPTADA', label: 'Aprobada', requiresReason: false },
            { status: 'RECHAZADA', label: 'Rechazada', requiresReason: false },
        ])
        expect(dto).toMatchObject({
            canEdit: true,
            canConvert: true,
            canDelete: false,
            canSend: true,
        })
    })

    it('lets a draft be deleted and sent only with an email', () => {
        expect(toQuoteDto(quote('BORRADOR', null), label)).toMatchObject({
            statusLabel: 'En preparación',
            allowedTransitions: [{ status: 'ENVIADA', label: 'Enviada', requiresReason: false }],
            canEdit: true,
            canDelete: true,
            canSend: false,
        })
    })

    it('closes a converted quote: no moves and no actions', () => {
        expect(toQuoteDto(quote('CONVERTIDA'), label)).toMatchObject({
            allowedTransitions: [],
            canEdit: false,
            canConvert: false,
            canDelete: false,
            canSend: false,
        })
    })

    it('reopens an expired quote as a draft', () => {
        const dto = toQuoteDto(quote('VENCIDA'), label)
        expect(dto.allowedTransitions.map((transition) => transition.status)).toEqual(['BORRADOR'])
        expect(dto.canConvert).toBe(false)
    })
})
