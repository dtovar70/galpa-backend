import { DEFAULT_SITE_CONTENT } from '../../content/content.defaults.js'
import type { ContactContent, PaymentContent } from '../../content/content.types.js'
import {
    isStatusEmailStatus,
    orderLinkEmail,
    orderReceivedEmail,
    orderStatusEmail,
    STATUS_EMAIL_STATUSES,
    type OrderReceivedData,
} from './order-emails.js'

const CONTACT: ContactContent = {
    email: 'ventas@galpa.com.ve',
    phone: '0414-0000000',
    whatsapp: '0414-5086536',
    city: 'Caracas',
    schedule: '',
    instagram: 'galpa2022',
    tiktok: '',
}
const SHOP = { brandName: 'Corporación Galpa 2022 C.A.', contact: CONTACT }
const PAYMENT: PaymentContent = {
    ...DEFAULT_SITE_CONTENT.payment,
    instructions: 'Envía la captura desde tu pedido.',
    pagoMovil: {
        enabled: true,
        bankCode: '0134',
        bankName: 'Banesco',
        phone: '0412-5550134',
        idNumber: 'J-123456789',
        holderName: 'Corporación Galpa 2022',
    },
    zelle: { enabled: true, email: 'pagos@galpa.com.ve', holderName: 'Galpa LLC' },
}
const LINK = 'https://galpa.com.ve/pedido/GP-000123?t=tok_en'

const ORDER: OrderReceivedData = {
    code: 'GP-000123',
    paymentMethodLabel: 'Pago Móvil',
    customerName: 'Ana María <Pérez>',
    deliveryMethod: 'delivery',
    address: 'Av. Principal, casa 4',
    city: 'Caracas',
    paymentMethod: 'PAGO_MOVIL',
    hasOnOrderItems: true,
    wantsInstallation: true,
    subtotalUsd: 652,
    discountUsd: 0,
    shippingUsd: 10,
    totalUsd: 662,
    totalBs: 102255.03,
    exchangeRate: 154.4637,
    exchangeRateDate: '2026-09-25',
    // 11:05 a. m. in Caracas (UTC-4).
    paymentDueAt: new Date('2026-09-26T15:05:00Z'),
    items: [
        {
            productId: 'p-remote',
            productName: 'Control remoto universal',
            variantLabel: null,
            brand: 'Chunghop',
            model: 'K-1028E',
            stockMode: 'STOCK',
            quantity: 1,
            unitPriceUsd: 12,
            lineTotalUsd: 12,
            sortOrder: 1,
        },
        {
            productId: 'p-split',
            productName: 'Split <Inverter> 12.000 BTU',
            variantLabel: '220V',
            brand: 'LG',
            model: 'S4-Q12JA',
            stockMode: 'ON_ORDER',
            quantity: 1,
            unitPriceUsd: 640,
            lineTotalUsd: 640,
            sortOrder: 0,
        },
    ],
}

describe('order emails', () => {
    it('"Pedido recibido" has the items, totals, Pago Móvil data, deadline, delivery and link', () => {
        const email = orderReceivedEmail(ORDER, PAYMENT, LINK, SHOP)
        expect(email.subject).toBe('Recibimos tu pedido GP-000123')

        const { text, html } = email
        expect(text).toContain('¡GRACIAS POR TU PEDIDO, ANA!')
        expect(text).toContain(
            'Recibimos tu pedido GP-000123 y ya lo apartamos para ti. Para confirmarlo solo falta tu pago por Pago Móvil.',
        )
        // Items in their order, with brand, model, quantity and "Bajo pedido".
        expect(text.indexOf('Split <Inverter> 12.000 BTU · 220V')).toBeLessThan(
            text.indexOf('Control remoto universal'),
        )
        expect(text).toContain(
            '- Split <Inverter> 12.000 BTU · 220V — $640,00\n  LG · S4-Q12JA\n  Cantidad: 1 × $640,00\n  Bajo pedido',
        )
        expect(text).toContain('Algunos productos de tu pedido son bajo pedido')
        expect(text).toContain(
            'Subtotal: $652,00\nEnvío: $10,00\nTotal: $662,00\nTotal en bolívares: Bs. 102.255,03',
        )
        expect(text).toContain('Tasa BCV del 25/09/2026: 154,4637 Bs/$')
        expect(text).toContain(
            'Datos para tu pago por Pago Móvil\nBanco: 0134 - Banesco\nTeléfono: 0412-5550134\nCédula / RIF: J-123456789\nTitular: Corporación Galpa 2022\nMonto exacto: Bs. 102.255,03\nConcepto: Pedido GP-000123',
        )
        expect(text).toContain('Envía la captura desde tu pedido.')
        expect(text).toContain(
            'Tienes hasta el 26/09/2026, 11:05 a. m. (hora de Venezuela) para pagar',
        )
        expect(text).toContain(
            'Entrega\nMétodo: Envío a domicilio\nDirección: Av. Principal, casa 4, Caracas\nInstalación: Te contactaremos para coordinarla',
        )
        expect(text).toContain(`Ver mi pedido: ${LINK}`)
        expect(text).toContain('WhatsApp (0414-5086536) (https://wa.me/584145086536)')

        expect(html).toContain('Split &lt;Inverter&gt; 12.000 BTU')
        expect(html).not.toContain('<Inverter>')
        expect(html).toContain(`href="${LINK}"`)
        expect(html).toContain('#0B6FB8')
    })

    it('a Zelle order asks for the dollar total and shows the Zelle account', () => {
        const { text, subject } = orderReceivedEmail(
            {
                ...ORDER,
                paymentMethod: 'ZELLE',
                paymentMethodLabel: 'Zelle',
                hasOnOrderItems: false,
            },
            PAYMENT,
            LINK,
            SHOP,
        )
        expect(subject).toBe('Recibimos tu pedido GP-000123')
        expect(text).toContain(
            'Datos para tu pago por Zelle\nCorreo Zelle: pagos@galpa.com.ve\nTitular: Galpa LLC\nMonto exacto: $662,00',
        )
        expect(text).not.toContain('Total en bolívares')
        expect(text).not.toContain('bajo pedido')
    })

    it('pickup has no address or shipping cost; an unconfigured method asks to write', () => {
        const { text } = orderReceivedEmail(
            {
                ...ORDER,
                deliveryMethod: 'pickup',
                shippingUsd: 0,
                paymentMethod: 'BINANCE',
                paymentMethodLabel: 'Binance Pay',
            },
            PAYMENT,
            LINK,
            { ...SHOP, contact: { ...CONTACT, whatsapp: '' } },
        )
        expect(text).toContain('Envío: Sin costo (retiro)')
        expect(text).toContain('Método: Retiro en tienda')
        expect(text).not.toContain('Dirección:')
        expect(text).not.toContain('Datos para tu pago')
        expect(text).toContain('Escríbenos para coordinar tu pago por Binance Pay')
        expect(text).toContain('Responde este correo y con gusto te ayudamos.')
    })

    it('"Consultar mi pedido" sends the link', () => {
        const email = orderLinkEmail({ code: 'GP-000123', customerName: 'Ana Pérez' }, LINK, SHOP)
        expect(email.subject).toBe('Tu enlace para ver el pedido GP-000123')
        expect(email.text).toContain('Nos pediste el enlace de tu pedido GP-000123.')
        expect(email.text).toContain(`Ver mi pedido: ${LINK}`)
        expect(email.html).toContain(`href="${LINK}"`)
    })
})

describe('status change emails', () => {
    const order = { code: 'GP-000123', customerName: 'Ana Pérez', hasOnOrderItems: false }

    it('covers the statuses the customer should hear about', () => {
        expect(STATUS_EMAIL_STATUSES).toEqual([
            'PAGO_VERIFICADO',
            'PAGO_RECHAZADO',
            'ESPERANDO_MERCANCIA',
            'LISTO_PARA_RETIRO',
            'DESPACHADO',
            'ENTREGADO',
            'CANCELADO',
            'EXPIRADO',
        ])
        expect(isStatusEmailStatus('PENDIENTE_VERIFICACION')).toBe(false)
        expect(isStatusEmailStatus('EN_PREPARACION')).toBe(false)
        expect(isStatusEmailStatus('DESPACHADO')).toBe(true)
    })

    it('a rejected payment carries the reason and the link', () => {
        const email = orderStatusEmail(order, 'PAGO_RECHAZADO', 'Monto <incompleto>', LINK, SHOP)
        expect(email.subject).toBe('Necesitamos revisar tu pago · GP-000123')
        expect(email.text).toContain('No pudimos confirmar el pago de tu pedido GP-000123.')
        expect(email.text).toContain('Motivo: Monto <incompleto>')
        expect(email.text).toContain(`Ver mi pedido: ${LINK}`)
        expect(email.html).toContain('Monto &lt;incompleto&gt;')
    })

    it('a shipped order shows the shipping details; statuses without a note skip it', () => {
        expect(orderStatusEmail(order, 'DESPACHADO', 'MRW guía 123', LINK, SHOP).text).toContain(
            'Datos del envío: MRW guía 123',
        )
        const delivered = orderStatusEmail(order, 'ENTREGADO', 'interna', LINK, SHOP)
        expect(delivered.subject).toBe('Pedido entregado · GP-000123')
        expect(delivered.text).not.toContain('interna')
    })

    it('an approved payment mentions the goods on order when there are some', () => {
        const email = orderStatusEmail(
            { ...order, hasOnOrderItems: true },
            'PAGO_VERIFICADO',
            null,
            LINK,
            SHOP,
        )
        expect(email.subject).toBe('Pago aprobado · GP-000123')
        expect(email.text).toContain('Confirmamos el pago de tu pedido GP-000123.')
        expect(email.text).toContain('productos bajo pedido')
    })
})
