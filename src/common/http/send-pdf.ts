import type { Response } from 'express'

/** A generated PDF (receipt, quote) and its download name. */
export interface PdfFile {
    filename: string
    content: Buffer
}

/**
 * Sends a PDF (`comprobante-GP-000012.pdf`, `cotizacion-COT-000045.pdf`), never cached: as a
 * download, or `inline` to open it in the browser.
 */
export function sendPdf(
    res: Response,
    file: PdfFile,
    disposition: 'attachment' | 'inline' = 'attachment',
): void {
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Length', String(file.content.length))
    res.setHeader('Content-Disposition', `${disposition}; filename="${file.filename}"`)
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.end(file.content)
}
