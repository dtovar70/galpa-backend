import type { ContactContent, PaymentContent } from '../../content/content.types.js'
import {
    designLine,
    orderLinkEmail,
    orderReceivedEmail,
    type OrderReceivedData,
} from './order-emails.js'

const CONTACT: ContactContent = {
    email: 'hola@manadarusso.com',
    phone: '0414-5086536',
    whatsapp: '0414-5086536',
    city: 'Caracas',
    schedule: '',
    instagram: 'manadarussocreativa',
    tiktok: '',
}
const SHOP = { brandName: 'Manada Russo Creativa', contact: CONTACT }
const PAYMENT: PaymentContent = {
    bankCode: '0134',
    bankName: 'Banesco',
    phone: '0412-5550134',
    idNumber: 'V-12345678',
    holderName: 'Manada Russo',
    instructions: 'Envía la captura desde tu pedido.',
}
const LINK = 'https://manadarusso.com/pedido/MR-000123?t=tok_en'

const ORDER: OrderReceivedData = {
    code: 'MR-000123',
    customerName: 'Ana María <Pérez>',
    deliveryMethod: 'delivery',
    address: 'Av. Principal, casa 4',
    city: 'Caracas',
    subtotalUsd: 32,
    shippingUsd: 4,
    totalUsd: 36,
    totalBs: 30760.69,
    exchangeRate: 854.4637,
    exchangeRateDate: '2026-09-25',
    // 11:05 a. m. in Caracas (UTC-4).
    paymentDueAt: new Date('2026-09-26T15:05:00Z'),
    items: [
        {
            productName: 'Franela',
            variantLabel: 'M',
            quantity: 1,
            unitPriceUsd: 20,
            lineTotalUsd: 20,
            personalization: null,
            sortOrder: 1,
        },
        {
            productName: 'Taza Café Primero',
            variantLabel: '15 oz',
            quantity: 2,
            unitPriceUsd: 6,
            lineTotalUsd: 12,
            personalization: '<b>Ñandú</b>',
            sortOrder: 0,
            designId: 'design-1',
            design: { colorName: 'Negro', colorHex: '#1F2937' },
        },
    ],
}

describe('order emails', () => {
    it('"Pedido recibido" has the items, totals, Pago Móvil data, deadline, delivery and link', () => {
        const email = orderReceivedEmail(ORDER, PAYMENT, LINK, SHOP)
        expect(email.subject).toBe('Recibimos tu pedido MR-000123')

        const { text, html } = email
        expect(text).toContain('¡GRACIAS POR TU PEDIDO, ANA!')
        expect(text).toContain('Recibimos tu pedido MR-000123 y ya lo apartamos para ti.')
        // Items in their order, with variant, quantity and personalization.
        expect(text.indexOf('Taza Café Primero · 15 oz')).toBeLessThan(text.indexOf('Franela · M'))
        expect(text).toContain(
            '- Taza Café Primero · 15 oz — $12,00\n  Cantidad: 2 × $6,00\n  Diseño propio: imprimiremos la imagen que subiste.\n  Color: Negro\n  Personalización: “<b>Ñandú</b>”',
        )
        expect(text).toContain(
            'Subtotal: $32,00\nEnvío: $4,00\nTotal: $36,00\nTotal en bolívares: Bs. 30.760,69',
        )
        expect(text).toContain('Tasa BCV del 25/09/2026: 854,4637 Bs/$')
        expect(text).toContain(
            'Datos para tu Pago Móvil\nBanco: 0134 - Banesco\nTeléfono: 0412-5550134\nCédula / RIF: V-12345678\nTitular: Manada Russo\nMonto exacto: Bs. 30.760,69\nConcepto: Pedido MR-000123',
        )
        expect(text).toContain('Envía la captura desde tu pedido.')
        expect(text).toContain(
            'Tienes hasta el 26/09/2026, 11:05 a. m. (hora de Venezuela) para pagar',
        )
        expect(text).toContain(
            'Entrega\nMétodo: Envío a domicilio\nDirección: Av. Principal, casa 4, Caracas',
        )
        expect(text).toContain(`Ver mi pedido: ${LINK}`)
        expect(text).toContain('WhatsApp (0414-5086536) (https://wa.me/584145086536)')

        expect(html).toContain('&lt;b&gt;Ñandú&lt;/b&gt;')
        // The garment color with its swatch.
        expect(html).toMatch(/background:#1F2937;[^>]*><\/span>Color: Negro/)
        expect(html).not.toContain('<b>Ñandú</b>')
        expect(html).toContain(`href="${LINK}"`)
        expect(html).toContain('Ver mi pedido')
    })

    it('pickup has no address or shipping cost; without Pago Móvil data it asks to write', () => {
        const { text } = orderReceivedEmail(
            { ...ORDER, deliveryMethod: 'pickup', shippingUsd: 0 },
            null,
            LINK,
            { ...SHOP, contact: { ...CONTACT, whatsapp: '' } },
        )
        expect(text).toContain('Envío: Sin costo (retiro)')
        expect(text).toContain('Método: Retiro en el taller')
        expect(text).not.toContain('Dirección:')
        expect(text).not.toContain('Datos para tu Pago Móvil')
        expect(text).toContain('Escríbenos para coordinar tu pago')
        expect(text).toContain('Responde este correo y con gusto te ayudamos.')
    })

    it('"Consultar mi pedido" sends the link', () => {
        const email = orderLinkEmail({ code: 'MR-000123', customerName: 'Ana Pérez' }, LINK, SHOP)
        expect(email.subject).toBe('Tu enlace para ver el pedido MR-000123')
        expect(email.text).toContain('Nos pediste el enlace de tu pedido MR-000123.')
        expect(email.text).toContain(`Ver mi pedido: ${LINK}`)
        expect(email.html).toContain(`href="${LINK}"`)
    })
})

describe('designLine', () => {
    it('mentions the texts of the design, or its images', () => {
        const image = { type: 'image' } as never
        const text = { type: 'text', content: 'Sofía 7' } as never
        expect(designLine([image, text])).toBe(
            'Diseño propio con texto «Sofía 7»: imprimiremos tu diseño tal como lo armaste.',
        )
        expect(designLine([image, image])).toBe(
            'Diseño propio: imprimiremos las imágenes que subiste.',
        )
        expect(designLine(undefined)).toBe('Diseño propio: imprimiremos la imagen que subiste.')
    })
})
