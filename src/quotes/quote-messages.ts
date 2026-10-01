import { formatDay } from '../common/utils/caracas-date.js'
import { formatBs, formatUsd } from '../common/utils/money-format.js'
import type { ContactContent } from '../content/content.types.js'
import { renderEmail, type EmailBlock } from '../mail/email-layout.js'
import { firstName } from '../orders/whatsapp/whatsapp-template.js'
import type { Quote } from './entities/quote.entity.js'

type QuoteSummary = Pick<
    Quote,
    'code' | 'customerName' | 'validUntil' | 'totalUsd' | 'totalBs' | 'exchangeRate'
>

/** "Cotización COT-000045": the PDF goes attached, and the link opens it online too. */
export function quoteEmail(
    quote: QuoteSummary,
    pdfUrl: string,
    shop: { brandName: string; contact: ContactContent },
): { subject: string; html: string; text: string } {
    const blocks: EmailBlock[] = [
        { kind: 'heading', text: `Hola, ${firstName(quote.customerName)}` },
        {
            kind: 'paragraph',
            parts: [
                'Gracias por tu interés. Te enviamos la cotización ',
                { bold: quote.code },
                ' con el detalle de los equipos y servicios que conversamos. La encuentras adjunta en PDF.',
            ],
        },
        {
            kind: 'rows',
            rows: [
                { label: 'Total', value: formatUsd(quote.totalUsd), strong: true },
                ...(quote.totalBs !== null
                    ? [{ label: 'Referencia en bolívares', value: formatBs(quote.totalBs) }]
                    : []),
                { label: 'Válida hasta', value: formatDay(quote.validUntil) },
            ],
        },
        { kind: 'button', href: pdfUrl, label: 'Ver la cotización' },
        {
            kind: 'paragraph',
            parts: [
                'Si quieres avanzar o ajustar algo, responde este correo o escríbenos por WhatsApp y con gusto te ayudamos.',
            ],
        },
    ]
    const rendered = renderEmail({
        brandName: shop.brandName,
        contact: shop.contact,
        preheader: `Cotización ${quote.code} por ${formatUsd(quote.totalUsd)}, válida hasta el ${formatDay(quote.validUntil)}.`,
        blocks,
    })
    return { subject: `Cotización ${quote.code} · ${shop.brandName}`, ...rendered }
}

/** The WhatsApp text the admin sends with the quote's public PDF link. */
export function quoteWhatsAppText(quote: QuoteSummary, pdfUrl: string, brandName: string): string {
    const name = firstName(quote.customerName)
    return [
        `¡Hola${name ? ` ${name}` : ''}! ${brandName} te saluda.`,
        `Aquí tienes tu cotización ${quote.code} por ${formatUsd(quote.totalUsd)}, válida hasta el ${formatDay(quote.validUntil)}:`,
        pdfUrl,
        'Cualquier duda o ajuste, respóndenos por aquí.',
    ].join('\n')
}
