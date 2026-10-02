import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import PDFDocument from 'pdfkit'

/**
 * Shared look of the generated PDFs (purchase receipt, quote): the "Brisa" palette (primary
 * blue, navy ink, light blue panels), Manrope for text, headings and figures (prices, codes,
 * BTU), the vector logo mark and the page footers.
 */

/**
 * `src/assets` (tsx, tests) or `dist/assets` (after `nest build`, which copies them: see the
 * `assets` entry of nest-cli.json). This file lives two folders below either root.
 */
const ASSETS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets')

const FONT_FILES = {
    regular: 'fonts/Manrope-Regular.ttf',
    semibold: 'fonts/Manrope-SemiBold.ttf',
    bold: 'fonts/Manrope-Bold.ttf',
    figures: 'fonts/Manrope-SemiBold.ttf',
    figuresBold: 'fonts/Manrope-ExtraBold.ttf',
} as const

/** Built-in PDF fonts, used if a TTF is missing (they lack "–" and a few other glyphs). */
const FALLBACK_FONTS: Record<keyof typeof FONT_FILES, string> = {
    regular: 'Helvetica',
    semibold: 'Helvetica-Bold',
    bold: 'Helvetica-Bold',
    figures: 'Helvetica',
    figuresBold: 'Helvetica-Bold',
}

export const PDF_COLOR = {
    ink: '#0F2537',
    soft: '#557086',
    line: '#DCE9F3',
    brand: '#0B6FB8',
    brandStrong: '#085A96',
    brandSoft: '#E1F0FB',
    surface: '#EEF6FC',
    frost: '#7CC4EC',
    /** The logo's first air wave. */
    frostSoft: '#BDE3F8',
    success: '#047857',
    successSoft: '#D1FAE5',
    warning: '#B45309',
    warningSoft: '#FEF3C7',
} as const

export type PdfFontKey = keyof typeof FONT_FILES
export type PdfDoc = PDFKit.PDFDocument

export const PAGE_MARGIN = 48
export const FOOTER_HEIGHT = 56

/**
 * Customer text may hold emoji, which the embedded fonts cannot draw (they would print as empty
 * boxes): they are dropped, the rest (accents, ñ, "–", "·") is kept.
 */
export function printable(text: string): string {
    return text
        .replace(/\p{Extended_Pictographic}|\u{FE0F}|\u{200D}|\u{20E3}|\p{Emoji_Modifier}/gu, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
}

/** Registers the brand fonts, falling back to the built-in ones when a file is missing. */
function registerFonts(doc: PdfDoc): Record<PdfFontKey, string> {
    const names = {} as Record<PdfFontKey, string>
    for (const key of Object.keys(FONT_FILES) as PdfFontKey[]) {
        const path = join(ASSETS_DIR, FONT_FILES[key])
        if (existsSync(path)) {
            doc.registerFont(key, path)
            names[key] = key
        } else {
            names[key] = FALLBACK_FONTS[key]
        }
    }
    return names
}

/**
 * An A4 document with the footer space reserved and the brand fonts registered. `done` resolves
 * with the bytes once `doc.end()` is called.
 */
export function createBrandedPdf(info: { title: string; author: string; subject: string }): {
    doc: PdfDoc
    fonts: Record<PdfFontKey, string>
    done: Promise<Buffer>
} {
    const doc = new PDFDocument({
        size: 'A4',
        margins: {
            top: PAGE_MARGIN,
            left: PAGE_MARGIN,
            right: PAGE_MARGIN,
            bottom: PAGE_MARGIN + FOOTER_HEIGHT,
        },
        bufferPages: true,
        info: { Title: info.title, Author: info.author, Subject: info.subject },
    })
    const chunks: Buffer[] = []
    const done = new Promise<Buffer>((resolve, reject) => {
        doc.on('data', (chunk: Buffer) => chunks.push(chunk))
        doc.on('end', () => resolve(Buffer.concat(chunks)))
        doc.on('error', reject)
    })
    return { doc, fonts: registerFonts(doc), done }
}

/** Base for the layouts: fonts, page bottom and page breaks. */
export abstract class BrandedLayout {
    protected readonly left = PAGE_MARGIN
    protected readonly width: number

    constructor(
        protected readonly doc: PdfDoc,
        protected readonly fonts: Record<PdfFontKey, string>,
    ) {
        this.width = doc.page.width - PAGE_MARGIN * 2
    }

    protected get bottom(): number {
        return this.doc.page.height - this.doc.page.margins.bottom
    }

    protected font(key: PdfFontKey, size: number, color: string = PDF_COLOR.ink): PdfDoc {
        return this.doc.font(this.fonts[key]).fontSize(size).fillColor(color)
    }

    /** Starts a new page when `height` does not fit below the cursor. */
    protected ensureSpace(height: number): void {
        if (this.doc.y + height > this.bottom) {
            this.doc.addPage()
            this.doc.y = PAGE_MARGIN
        }
    }

    protected sectionTitle(title: string): void {
        this.ensureSpace(60)
        this.font('bold', 12).text(title, this.left, this.doc.y, { width: this.width })
        this.doc.y += 4
    }

    /**
     * The header band: logo mark, brand and tagline on the left; the document title, its code
     * and a line under it on the right. Leaves the cursor below the green rule.
     */
    protected brandHeader(
        brand: { name: string; tagline: string },
        document: {
            title: string
            code: string
            caption: string
        },
    ): void {
        const { doc, left, width } = this
        const top = PAGE_MARGIN
        const markSize = 54
        drawLogoMark(doc, this.fonts, left, top - 2, markSize)
        const textLeft = left + markSize + 12

        this.font('bold', 15).text(printable(brand.name), textLeft, top + 8, {
            width: 250,
            lineBreak: false,
        })
        this.font('regular', 9, PDF_COLOR.soft).text(printable(brand.tagline), textLeft, top + 30, {
            width: 250,
            lineBreak: false,
        })

        const rightWidth = 200
        const rightLeft = left + width - rightWidth
        this.font('bold', 15, PDF_COLOR.brandStrong).text(document.title, rightLeft, top + 2, {
            width: rightWidth,
            align: 'right',
        })
        this.font('figuresBold', 13).text(document.code, rightLeft, top + 24, {
            width: rightWidth,
            align: 'right',
        })
        this.font('regular', 8.5, PDF_COLOR.soft).text(document.caption, rightLeft, top + 42, {
            width: rightWidth,
            align: 'right',
        })

        const lineY = top + markSize + 14
        doc.moveTo(left, lineY)
            .lineTo(left + width, lineY)
            .lineWidth(2)
            .strokeColor(PDF_COLOR.brand)
            .stroke()
        doc.y = lineY + 16
    }

    /** A soft card with a title and label/value rows. */
    protected card(
        title: string,
        rows: [string, string][],
        x: number,
        y: number,
        cardWidth: number,
        height: number,
    ): void {
        const { doc } = this
        doc.roundedRect(x, y, cardWidth, height, 8).fillColor(PDF_COLOR.surface).fill()
        this.font('bold', 10.5, PDF_COLOR.brandStrong).text(title, x + 12, y + 10, {
            width: cardWidth - 24,
            lineBreak: false,
        })
        let rowY = y + 30
        const labelWidth = 62
        for (const [label, value] of rows) {
            this.font('semibold', 8.5, PDF_COLOR.soft).text(label, x + 12, rowY, {
                width: labelWidth,
                lineBreak: false,
            })
            this.font('regular', 9).text(printable(value) || '—', x + 12 + labelWidth, rowY, {
                width: cardWidth - 24 - labelWidth,
            })
            rowY = Math.max(doc.y, rowY + 12) + 4
        }
    }

    protected cardHeight(rows: [string, string][], cardWidth: number): number {
        const inner = cardWidth - 24 - 62
        this.font('regular', 9)
        const body = rows.reduce(
            (sum, [, value]) =>
                sum +
                Math.max(12, this.doc.heightOfString(printable(value) || '—', { width: inner })) +
                4,
            0,
        )
        return 30 + body + 6
    }

    /** Disclaimer, contact line and page number at the bottom of every page. */
    protected footers(disclaimer: string, contact: string, code: string): void {
        const { doc, left, width } = this
        const range = doc.bufferedPageRange()
        for (let index = range.start; index < range.start + range.count; index++) {
            doc.switchToPage(index)
            // Writing inside the bottom margin would open a new page: lift it while drawing.
            const margin = doc.page.margins.bottom
            doc.page.margins.bottom = 0
            const y = doc.page.height - PAGE_MARGIN - FOOTER_HEIGHT + 14
            doc.moveTo(left, y)
                .lineTo(left + width, y)
                .lineWidth(0.75)
                .strokeColor(PDF_COLOR.line)
                .stroke()
            this.font('semibold', 8).text(disclaimer, left, y + 9, {
                width,
                align: 'center',
                lineBreak: false,
            })
            this.font('regular', 8, PDF_COLOR.soft).text(contact, left, y + 22, {
                width,
                align: 'center',
                lineBreak: false,
            })
            this.font('regular', 7.5, PDF_COLOR.soft).text(
                `${code} · Página ${index - range.start + 1} de ${range.count}`,
                left,
                y + 35,
                { width, align: 'center', lineBreak: false },
            )
            doc.page.margins.bottom = margin
        }
    }
}

/** "WhatsApp 0414-0000000 · ventas@… · @galpa2022 · Ciudad" (empty parts skipped). */
export function contactLine(contact: {
    whatsapp: string
    email: string
    instagram: string
    city: string
}): string {
    return [
        contact.whatsapp ? `WhatsApp ${contact.whatsapp}` : '',
        contact.email,
        contact.instagram ? `@${contact.instagram}` : '',
        contact.city,
    ]
        .map(printable)
        .filter(Boolean)
        .join('  ·  ')
}

/**
 * The logo mark drawn as vectors, the same drawing as the storefront's favicon: a white split
 * unit blowing two waves of air on a blue tile (64-unit grid, scaled to `size`).
 */
function drawLogoMark(
    doc: PdfDoc,
    _fonts: Record<PdfFontKey, string>,
    x: number,
    y: number,
    size: number,
): void {
    const scale = size / 64
    doc.save()
    doc.translate(x, y).scale(scale)
    doc.roundedRect(0, 0, 64, 64, 16).fillColor(PDF_COLOR.brand).fill()
    doc.lineCap('round').lineJoin('round')
    doc.roundedRect(9, 13, 46, 19, 6).lineWidth(4).strokeColor('#FFFFFF').stroke()
    doc.path('M17 26H47').lineWidth(3).strokeColor('#FFFFFF').stroke()
    doc.path('M15 41C19 38 23 44 27 41S35 38 39 41S47 44 49 41')
        .lineWidth(3.5)
        .strokeColor(PDF_COLOR.frostSoft)
        .stroke()
    doc.path('M21 50C24.5 47.5 28 52.5 31.5 50S38.5 47.5 43 50')
        .lineWidth(3.5)
        .strokeColor('#FFFFFF')
        .stroke()
    doc.restore()
}
