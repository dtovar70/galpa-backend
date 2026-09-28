import QRCode from 'qrcode'

/**
 * Scan-friendly settings for the order QR: medium error correction (survives a smudge or a
 * slightly bent label), a 4-module quiet zone (what the spec asks for) and pure black on white.
 */
export const ORDER_QR_OPTIONS = {
    errorCorrectionLevel: 'M',
    margin: 4,
    color: { dark: '#000000ff', light: '#ffffffff' },
} as const

/**
 * PNG of the QR for the customer's private order link (`<PUBLIC_SITE_URL>/pedido/<code>?t=…`).
 * The QR is tied to the order and its secret token, never to the customer's email.
 */
export function orderQrPng(url: string, widthPx = 480): Promise<Buffer> {
    // Opaque RGB (pngjs colorType 2): no alpha channel, so the PDF needs no soft mask.
    const rendererOpts = { deflateLevel: 9, colorType: 2 }
    return QRCode.toBuffer(url, { ...ORDER_QR_OPTIONS, type: 'png', width: widthPx, rendererOpts })
}
