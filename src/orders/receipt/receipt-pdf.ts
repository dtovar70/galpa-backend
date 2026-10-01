import {
    BrandedLayout,
    contactLine,
    createBrandedPdf,
    PAGE_MARGIN,
    PDF_COLOR,
    printable,
    type PdfFontKey,
} from '../../common/pdf/pdf-brand.js'
import { formatBs, formatUsd, formatVeNumber } from '../../common/utils/money-format.js'

/** Everything printed on the receipt, already resolved (labels, Caracas dates as text). */
export interface ReceiptData {
    /** PNG of the QR to the customer's order page; null or missing prints no QR. */
    orderQr?: Buffer | null
    brandName: string
    tagline: string
    contact: { phone: string; whatsapp: string; email: string; city: string; instagram: string }
    code: string
    /** "25/09/2026, 10:42 a. m." (Caracas). */
    issuedAt: string
    verifiedAt: string | null
    statusLabel: string
    customer: { name: string; email: string; phone: string; idNumber: string | null }
    delivery: { method: string; address: string }
    items: {
        name: string
        variant: string | null
        /** "Daikin · FTKF12" (empty parts skipped); null when unknown. */
        brandModel: string | null
        /** The line is sold "bajo pedido". */
        onOrder: boolean
        quantity: number
        unitUsd: number
        totalUsd: number
    }[]
    subtotalUsd: number
    discountUsd: number
    shippingUsd: number
    totalUsd: number
    exchangeRate: number
    /** "24/09/2026". */
    exchangeRateDate: string
    exchangeRateSource: string
    totalBs: number
    payment: {
        /** "Pago Móvil", "Zelle"… */
        methodLabel: string
        /** True for Pago Móvil and transfers (amounts in Bs). */
        inBolivars: boolean
        /** Label/value rows of the method's details ("Banco", "Referencia"…). */
        details: [string, string][]
    }
}

type TotalRow = [label: string, value: string, tone: 'normal' | 'strong' | 'soft']

export const RECEIPT_DISCLAIMER =
    'Este documento es un comprobante de compra y no sustituye una factura fiscal.'

/** The "Marca / modelo" cell: brand and model, then "Bajo pedido" when it applies. */
export function brandModelCell(
    item: Pick<ReceiptData['items'][number], 'brandModel' | 'onOrder'>,
): string {
    return (
        [item.brandModel ? printable(item.brandModel) : null, item.onOrder ? 'Bajo pedido' : null]
            .filter(Boolean)
            .join('\n') || '—'
    )
}

/** Renders the "Comprobante de compra" (A4) and resolves with the PDF bytes. */
export function renderReceiptPdf(data: ReceiptData): Promise<Buffer> {
    const { doc, fonts, done } = createBrandedPdf({
        title: `Comprobante de compra ${data.code}`,
        author: data.brandName,
        subject: 'Comprobante de compra',
    })
    new ReceiptLayout(doc, fonts, data).draw()
    doc.end()
    return done
}

class ReceiptLayout extends BrandedLayout {
    constructor(
        doc: PDFKit.PDFDocument,
        fonts: Record<PdfFontKey, string>,
        private readonly data: ReceiptData,
    ) {
        super(doc, fonts)
    }

    draw(): void {
        this.brandHeader(
            { name: this.data.brandName, tagline: this.data.tagline },
            {
                title: 'Comprobante de compra',
                code: this.data.code,
                caption: `Emitido: ${this.data.issuedAt}`,
            },
        )
        this.parties()
        this.itemsTable()
        this.totalsAndPayment()
        this.trackingQr()
        this.footers(RECEIPT_DISCLAIMER, contactLine(this.data.contact), this.data.code)
    }

    /** "Cliente" and "Entrega" side by side, as soft cards. */
    private parties(): void {
        const { data, left, width } = this
        const gap = 14
        const cardWidth = (width - gap) / 2
        const top = this.doc.y
        const customer: [string, string][] = [
            ['Nombre', data.customer.name],
            ['Cédula/RIF', data.customer.idNumber ?? '—'],
            ['Correo', data.customer.email],
            ['Teléfono', data.customer.phone],
        ]
        const delivery: [string, string][] = [
            ['Método', data.delivery.method],
            ['Dirección', data.delivery.address],
        ]
        const height = Math.max(
            this.cardHeight(customer, cardWidth),
            this.cardHeight(delivery, cardWidth),
        )
        this.card('Cliente', customer, left, top, cardWidth, height)
        this.card('Entrega', delivery, left + cardWidth + gap, top, cardWidth, height)
        this.doc.y = top + height + 18
    }

    private readonly columns = [
        { key: 'name', label: 'Producto', width: 150, align: 'left' },
        { key: 'brandModel', label: 'Marca / modelo', width: 100, align: 'left' },
        { key: 'variant', label: 'Variante', width: 69, align: 'left' },
        { key: 'quantity', label: 'Cant.', width: 36, align: 'center' },
        { key: 'unit', label: 'P. unitario', width: 70, align: 'right' },
        { key: 'total', label: 'Total', width: 74, align: 'right' },
    ] as const

    private tableHeader(): void {
        const { doc, left, width } = this
        const y = doc.y
        doc.roundedRect(left, y, width, 22, 5).fillColor(PDF_COLOR.brandSoft).fill()
        let x = left
        for (const column of this.columns) {
            this.font('semibold', 8.5, PDF_COLOR.brandStrong).text(column.label, x + 6, y + 7, {
                width: column.width - 12,
                align: column.align,
                lineBreak: false,
            })
            x += column.width
        }
        doc.y = y + 26
    }

    private itemsTable(): void {
        const { doc, data, left, width } = this
        this.sectionTitle('Productos')
        this.tableHeader()

        for (const item of data.items) {
            const cells: Record<(typeof this.columns)[number]['key'], string> = {
                name: printable(item.name),
                brandModel: brandModelCell(item),
                variant: item.variant ? printable(item.variant) : '—',
                quantity: String(item.quantity),
                unit: formatUsd(item.unitUsd),
                total: formatUsd(item.totalUsd),
            }
            this.font('regular', 9)
            const height =
                Math.max(
                    ...this.columns.map((column) =>
                        doc.heightOfString(cells[column.key], { width: column.width - 12 }),
                    ),
                ) + 12
            if (doc.y + height > this.bottom) {
                doc.addPage()
                doc.y = PAGE_MARGIN
                this.tableHeader()
            }
            const y = doc.y
            let x = left
            for (const column of this.columns) {
                const key: PdfFontKey =
                    column.key === 'unit' || column.key === 'total'
                        ? 'figures'
                        : column.key === 'name'
                          ? 'semibold'
                          : 'regular'
                const color =
                    column.key === 'variant' || column.key === 'brandModel'
                        ? PDF_COLOR.soft
                        : PDF_COLOR.ink
                this.font(key, 9, color).text(cells[column.key], x + 6, y + 6, {
                    width: column.width - 12,
                    align: column.align,
                })
                x += column.width
            }
            doc.moveTo(left, y + height)
                .lineTo(left + width, y + height)
                .lineWidth(0.75)
                .strokeColor(PDF_COLOR.line)
                .stroke()
            doc.y = y + height
        }
        doc.y += 14
    }

    /** Payment details (left) and totals (right). Kept together on one page. */
    private totalsAndPayment(): void {
        const { doc, data, left, width } = this
        const gap = 16
        const totalsWidth = 228
        const paymentWidth = width - totalsWidth - gap
        const discount: TotalRow[] =
            data.discountUsd > 0 ? [['Descuento', `-${formatUsd(data.discountUsd)}`, 'normal']] : []
        const totals: TotalRow[] = [
            ['Subtotal', formatUsd(data.subtotalUsd), 'normal'],
            ...discount,
            ['Envío', data.shippingUsd > 0 ? formatUsd(data.shippingUsd) : 'Gratis', 'normal'],
            ['Total USD', formatUsd(data.totalUsd), 'strong'],
            ['Tasa BCV', `${formatVeNumber(data.exchangeRate, 4)} Bs./USD`, 'soft'],
            ['Fecha de la tasa', `${data.exchangeRateDate} · ${data.exchangeRateSource}`, 'soft'],
        ]
        const payment: [string, string][] = [
            ...data.payment.details,
            ['Verificado', data.verifiedAt ?? '—'],
        ]
        const blockHeight = Math.max(30 + payment.length * 17 + 40, 30 + totals.length * 19 + 56)
        this.ensureSpace(blockHeight + 40)
        const top = doc.y

        // Payment card.
        doc.roundedRect(left, top, paymentWidth, blockHeight, 8).fillColor(PDF_COLOR.surface).fill()
        this.font('bold', 10.5, PDF_COLOR.brandStrong).text(
            printable(data.payment.methodLabel),
            left + 12,
            top + 10,
            { width: paymentWidth - 24, lineBreak: false },
        )
        const badge = 'Pago verificado'
        this.font('semibold', 8)
        const badgeWidth = doc.widthOfString(badge) + 16
        doc.roundedRect(left + paymentWidth - 12 - badgeWidth, top + 9, badgeWidth, 16, 8)
            .fillColor(PDF_COLOR.brandSoft)
            .fill()
        this.font('semibold', 8, PDF_COLOR.brandStrong).text(
            badge,
            left + paymentWidth - 12 - badgeWidth,
            top + 13,
            { width: badgeWidth, align: 'center', lineBreak: false },
        )
        let rowY = top + 34
        for (const [label, value] of payment) {
            this.font('semibold', 8.5, PDF_COLOR.soft).text(label, left + 12, rowY, {
                width: 96,
                lineBreak: false,
            })
            this.font('regular', 9).text(printable(value), left + 112, rowY, {
                width: paymentWidth - 124,
                lineBreak: false,
                ellipsis: true,
            })
            rowY += 17
        }
        this.font('semibold', 8.5, PDF_COLOR.soft).text('Estado actual', left + 12, rowY + 6, {
            width: 96,
            lineBreak: false,
        })
        this.font('bold', 9, PDF_COLOR.brandStrong).text(
            printable(data.statusLabel),
            left + 112,
            rowY + 6,
            { width: paymentWidth - 124, lineBreak: false },
        )

        // Totals.
        const x = left + paymentWidth + gap
        let y = top + 4
        for (const [label, value, tone] of totals) {
            const size = tone === 'strong' ? 11 : tone === 'soft' ? 8.5 : 9.5
            const color = tone === 'soft' ? PDF_COLOR.soft : PDF_COLOR.ink
            this.font(tone === 'strong' ? 'bold' : 'regular', size, color).text(label, x, y, {
                width: 100,
                lineBreak: false,
            })
            this.font(tone === 'strong' ? 'figuresBold' : 'figures', size, color).text(
                value,
                x + 92,
                y,
                { width: totalsWidth - 92, align: 'right', lineBreak: false },
            )
            y += tone === 'strong' ? 22 : 18
            if (tone === 'strong') {
                doc.moveTo(x, y - 6)
                    .lineTo(x + totalsWidth, y - 6)
                    .lineWidth(0.75)
                    .strokeColor(PDF_COLOR.line)
                    .stroke()
            }
        }
        // The amount the customer actually paid in: bolívares or dollars.
        const bsTop = top + blockHeight - 48
        doc.roundedRect(x, bsTop, totalsWidth, 48, 8).fillColor(PDF_COLOR.brand).fill()
        this.font('semibold', 8.5, '#ffffff').text(
            data.payment.inBolivars ? 'Total en bolívares' : 'Total en dólares',
            x + 12,
            bsTop + 9,
            { width: totalsWidth - 24, lineBreak: false },
        )
        this.font('figuresBold', 16, '#ffffff').text(
            data.payment.inBolivars ? formatBs(data.totalBs) : formatUsd(data.totalUsd),
            x + 12,
            bsTop + 22,
            { width: totalsWidth - 24, align: 'right', lineBreak: false },
        )
        doc.y = top + blockHeight + 18
    }

    /**
     * "Escanea para ver el estado de tu pedido": a small card under the totals with the QR of
     * the customer's private order link (about 76 pt, black on white, quiet zone included).
     */
    private trackingQr(): void {
        const { doc, data, left, width } = this
        if (!data.orderQr) return
        const cardWidth = 228
        const cardHeight = 92
        const qrSize = 76
        this.ensureSpace(cardHeight + 8)
        const top = doc.y - 4
        const x = left + width - cardWidth
        doc.roundedRect(x, top, cardWidth, cardHeight, 8)
            .lineWidth(1)
            .strokeColor(PDF_COLOR.brandSoft)
            .stroke()
        // The PNG carries its own white quiet zone; the card only frames it.
        doc.image(data.orderQr, x + 8, top + (cardHeight - qrSize) / 2, {
            width: qrSize,
            height: qrSize,
        })
        const textLeft = x + 8 + qrSize + 8
        const textWidth = cardWidth - (textLeft - x) - 10
        this.font('bold', 10.5, PDF_COLOR.brandStrong).text('Sigue tu pedido', textLeft, top + 16, {
            width: textWidth,
            lineBreak: false,
        })
        this.font('semibold', 8.5).text(
            'Escanea para ver el estado de tu pedido',
            textLeft,
            top + 33,
            { width: textWidth },
        )
        this.font('regular', 7.5, PDF_COLOR.soft).text(
            'Es tu enlace privado: no lo compartas.',
            textLeft,
            doc.y + 4,
            { width: textWidth },
        )
        doc.y = top + cardHeight + 18
    }
}
