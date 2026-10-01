import {
    BrandedLayout,
    contactLine,
    createBrandedPdf,
    PAGE_MARGIN,
    PDF_COLOR,
    printable,
    type PdfFontKey,
} from '../common/pdf/pdf-brand.js'
import { formatBs, formatUsd, formatVeNumber } from '../common/utils/money-format.js'

/** Everything printed on the quote, already resolved (dates as text). */
export interface QuotePdfData {
    brandName: string
    tagline: string
    contact: { whatsapp: string; email: string; city: string; instagram: string; phone: string }
    code: string
    /** "25/09/2026". */
    issuedOn: string
    validUntil: string
    customer: {
        name: string
        company: string | null
        idNumber: string | null
        email: string | null
        phone: string | null
    }
    items: {
        description: string
        /** "Daikin · FTKF12"; null when unknown. */
        brandModel: string | null
        quantity: number
        unitUsd: number
        totalUsd: number
    }[]
    subtotalUsd: number
    discountUsd: number
    totalUsd: number
    exchangeRate: number | null
    totalBs: number | null
    notes: string
    terms: string
}

export const QUOTE_DISCLAIMER =
    'Precios en dólares. El monto en bolívares es referencial y se calcula a la tasa BCV del día del pago.'

type TotalRow = [label: string, value: string, tone: 'normal' | 'strong' | 'soft']

/** Renders the "Cotización" (A4) and resolves with the PDF bytes. */
export function renderQuotePdf(data: QuotePdfData): Promise<Buffer> {
    const { doc, fonts, done } = createBrandedPdf({
        title: `Cotización ${data.code}`,
        author: data.brandName,
        subject: 'Cotización',
    })
    new QuoteLayout(doc, fonts, data).draw()
    doc.end()
    return done
}

class QuoteLayout extends BrandedLayout {
    constructor(
        doc: PDFKit.PDFDocument,
        fonts: Record<PdfFontKey, string>,
        private readonly data: QuotePdfData,
    ) {
        super(doc, fonts)
    }

    draw(): void {
        const { data } = this
        this.brandHeader(
            { name: data.brandName, tagline: data.tagline },
            {
                title: 'Cotización',
                code: data.code,
                caption: `Emitida: ${data.issuedOn} · Válida hasta: ${data.validUntil}`,
            },
        )
        this.parties()
        this.itemsTable()
        this.totals()
        this.texts()
        this.footers(QUOTE_DISCLAIMER, contactLine(data.contact), data.code)
    }

    private parties(): void {
        const { data, left, width } = this
        const gap = 14
        const cardWidth = (width - gap) / 2
        const top = this.doc.y
        const customer: [string, string][] = [
            ['Nombre', data.customer.name],
            ...(data.customer.company
                ? [['Empresa', data.customer.company] as [string, string]]
                : []),
            ['Cédula/RIF', data.customer.idNumber ?? '—'],
            ['Correo', data.customer.email ?? '—'],
            ['Teléfono', data.customer.phone ?? '—'],
        ]
        const store: [string, string][] = [
            ['Correo', data.contact.email],
            ['Teléfono', data.contact.phone],
            ['Dirección', data.contact.city],
            ['Vigencia', `Hasta el ${data.validUntil}`],
        ]
        const height = Math.max(
            this.cardHeight(customer, cardWidth),
            this.cardHeight(store, cardWidth),
        )
        this.card('Cliente', customer, left, top, cardWidth, height)
        this.card('Atención', store, left + cardWidth + gap, top, cardWidth, height)
        this.doc.y = top + height + 18
    }

    private readonly columns = [
        { key: 'description', label: 'Descripción', width: 205, align: 'left' },
        { key: 'brandModel', label: 'Marca / modelo', width: 110, align: 'left' },
        { key: 'quantity', label: 'Cant.', width: 40, align: 'center' },
        { key: 'unit', label: 'P. unitario', width: 72, align: 'right' },
        { key: 'total', label: 'Total', width: 72, align: 'right' },
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
        this.sectionTitle('Detalle')
        this.tableHeader()
        for (const item of data.items) {
            const cells: Record<(typeof this.columns)[number]['key'], string> = {
                description: printable(item.description),
                brandModel: item.brandModel ? printable(item.brandModel) : '—',
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
                        : column.key === 'description'
                          ? 'semibold'
                          : 'regular'
                const color = column.key === 'brandModel' ? PDF_COLOR.soft : PDF_COLOR.ink
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

    /** Totals on the right; the bolívar reference below them when there is a rate. */
    private totals(): void {
        const { doc, data, left, width } = this
        const totalsWidth = 240
        const rows: TotalRow[] = [
            ['Subtotal', formatUsd(data.subtotalUsd), 'normal'],
            ...(data.discountUsd > 0
                ? ([['Descuento', `-${formatUsd(data.discountUsd)}`, 'normal']] as TotalRow[])
                : []),
            ['Total USD', formatUsd(data.totalUsd), 'strong'],
            ...(data.exchangeRate !== null && data.totalBs !== null
                ? ([
                      ['Referencia en Bs.', formatBs(data.totalBs), 'soft'],
                      ['Tasa BCV', `${formatVeNumber(data.exchangeRate, 4)} Bs./USD`, 'soft'],
                  ] as TotalRow[])
                : []),
        ]
        this.ensureSpace(rows.length * 20 + 70)
        const x = left + width - totalsWidth
        let y = doc.y
        for (const [label, value, tone] of rows) {
            if (tone === 'strong') {
                doc.roundedRect(x, y - 6, totalsWidth, 30, 8)
                    .fillColor(PDF_COLOR.brand)
                    .fill()
                this.font('bold', 11, '#ffffff').text(label, x + 12, y + 3, {
                    width: 110,
                    lineBreak: false,
                })
                this.font('figuresBold', 13, '#ffffff').text(value, x + 110, y + 1, {
                    width: totalsWidth - 122,
                    align: 'right',
                    lineBreak: false,
                })
                y += 32
                continue
            }
            const size = tone === 'soft' ? 8.5 : 9.5
            const color = tone === 'soft' ? PDF_COLOR.soft : PDF_COLOR.ink
            this.font('regular', size, color).text(label, x + 12, y, {
                width: 120,
                lineBreak: false,
            })
            this.font('figures', size, color).text(value, x + 110, y, {
                width: totalsWidth - 122,
                align: 'right',
                lineBreak: false,
            })
            y += 18
        }
        doc.y = y + 12
    }

    private texts(): void {
        for (const [title, body] of [
            ['Notas', this.data.notes],
            ['Condiciones', this.data.terms],
        ] as const) {
            if (!body.trim()) continue
            this.sectionTitle(title)
            this.font('regular', 9).text(printable(body), this.left, this.doc.y, {
                width: this.width,
            })
            this.doc.y += 12
        }
    }
}
