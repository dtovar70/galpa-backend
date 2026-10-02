import { printable } from '../../common/pdf/pdf-brand.js'
import { orderQrPng } from '../qr/order-qr.js'
import { brandModelCell, renderReceiptPdf, type ReceiptData } from './receipt-pdf.js'

function receipt(items: number, inBolivars = true): ReceiptData {
    return {
        brandName: 'Corporación Galpa 2022 C.A.',
        tagline: '30 años climatizando tus espacios',
        contact: {
            phone: '0414-0000000',
            whatsapp: '0414-0000000',
            email: 'ventas@galpa.com.ve',
            city: 'Dirección por configurar',
            instagram: 'galpa2022',
        },
        code: 'GP-000012',
        issuedAt: '25/09/2026, 10:42 a. m.',
        verifiedAt: '24/09/2026, 3:05 p. m.',
        statusLabel: 'Preparando despacho',
        customer: {
            name: 'Ana María Pérez',
            email: 'ana@example.com',
            phone: '0414-1234567',
            idNumber: 'V-12345678',
        },
        delivery: { method: 'Envío a domicilio', address: 'Av. Principal, casa 4, Caracas' },
        items: Array.from({ length: items }, (_, index) => ({
            name: `Split Inverter Ñandú ${index + 1}`,
            variant: '220V',
            brandModel: 'LG · S4-Q12JA',
            onOrder: index % 2 === 1,
            quantity: 2,
            unitUsd: 640,
            totalUsd: 1280,
        })),
        subtotalUsd: 1280 * items,
        discountUsd: 0,
        shippingUsd: 0,
        totalUsd: 1280 * items,
        exchangeRate: 154.4637,
        exchangeRateDate: '24/09/2026',
        exchangeRateSource: 'BCV (bcv.org.ve)',
        totalBs: 197713.54 * items,
        payment: inBolivars
            ? {
                  methodLabel: 'Pago Móvil',
                  inBolivars: true,
                  details: [
                      ['Banco', 'Banco de Venezuela'],
                      ['Referencia', '00123456'],
                      ['Teléfono pagador', '0414-1234567'],
                      ['Fecha del pago', '24/09/2026'],
                      ['Monto pagado', 'Bs. 197.713,54'],
                  ],
              }
            : {
                  methodLabel: 'Zelle',
                  inBolivars: false,
                  details: [
                      ['Titular', 'Ana Pérez'],
                      ['Cuenta Zelle', 'ana@example.com'],
                      ['Confirmación', 'ZL12AB34'],
                      ['Fecha del pago', '24/09/2026'],
                      ['Monto pagado', '$1.280,00'],
                  ],
              },
    }
}

/** Number of `/Type /Page` objects (pages, not the `/Pages` tree). */
function pageCount(pdf: Buffer): number {
    return pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g)?.length ?? 0
}

describe('receipt PDF', () => {
    it('renders a one-page A4 PDF with the embedded brand fonts', async () => {
        const pdf = await renderReceiptPdf(receipt(3))
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
        expect(pageCount(pdf)).toBe(1)
        const raw = pdf.toString('latin1')
        expect(raw).toContain('Manrope-Regular')
        expect(raw).toContain('Manrope-ExtraBold')
        expect(raw).toContain('/MediaBox [0 0 595.28 841.89]')
    })

    it('renders a dollar payment (Zelle) with a discount', async () => {
        const pdf = await renderReceiptPdf({ ...receipt(2, false), discountUsd: 50 })
        expect(pageCount(pdf)).toBe(1)
    })

    it('prints the order QR next to the totals and stays on one page', async () => {
        const plain = await renderReceiptPdf(receipt(3))
        const withQr = await renderReceiptPdf({
            ...receipt(3),
            orderQr: await orderQrPng('https://galpa.com.ve/pedido/GP-000012?t=abc', 360),
        })
        const images = (pdf: Buffer) =>
            pdf.toString('latin1').match(/\/Subtype \/Image/g)?.length ?? 0
        expect(images(withQr)).toBe(images(plain) + 1)
        expect(pageCount(withQr)).toBe(1)
    })

    it('shows brand, model and "Bajo pedido" in the brand column', () => {
        expect(brandModelCell({ brandModel: 'Daikin · FTKF09', onOrder: true })).toBe(
            'Daikin · FTKF09\nBajo pedido',
        )
        expect(brandModelCell({ brandModel: null, onOrder: false })).toBe('—')
    })

    it('paginates long item lists', async () => {
        const pdf = await renderReceiptPdf(receipt(40))
        expect(pageCount(pdf)).toBeGreaterThan(1)
    })

    it('drops emoji the fonts cannot draw but keeps Spanish text', () => {
        expect(printable('¡Feliz día, Begoña! 🎉 – ✅ «ñ» · 👍🏽')).toBe(
            '¡Feliz día, Begoña! – «ñ» ·',
        )
    })
})
