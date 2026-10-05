import { formatCaracasDateTime } from '../common/utils/caracas-date.js'
import type { ContactContent } from '../content/content.types.js'
import { renderEmail, type EmailBlock } from '../mail/email-layout.js'
import type { ContactMessageReceivedEvent } from './contact.events.js'

/** "Nuevo mensaje de contacto" for the store's inbox (the customer is the reply-to). */
export function contactInboxEmail(
    event: ContactMessageReceivedEvent,
    shop: { brandName: string; contact: ContactContent },
): { subject: string; html: string; text: string } {
    const rows: { label: string; value: string }[] = [
        { label: 'Nombre', value: event.fullName },
        { label: 'Correo', value: event.email },
        ...(event.phone ? [{ label: 'WhatsApp', value: event.phone }] : []),
        { label: 'Tema', value: event.topicLabel },
        ...(event.spaceTypeLabel
            ? [{ label: 'Tipo de espacio', value: event.spaceTypeLabel }]
            : []),
        ...(event.areaM2 !== null ? [{ label: 'Área', value: `${event.areaM2} m²` }] : []),
        ...(event.product ? [{ label: 'Producto', value: event.product.name }] : []),
        { label: 'Recibido', value: formatCaracasDateTime(new Date(event.receivedAt)) },
    ]
    const blocks: EmailBlock[] = [
        { kind: 'heading', text: 'Nuevo mensaje de contacto' },
        { kind: 'rows', rows },
        { kind: 'paragraph', parts: [event.message] },
        ...(event.product
            ? [{ kind: 'button', href: event.product.url, label: 'Ver el producto' } as const]
            : []),
        { kind: 'note', parts: ['Responde este correo para escribirle directamente al cliente.'] },
    ]
    const rendered = renderEmail({
        brandName: shop.brandName,
        contact: shop.contact,
        preheader: `${event.topicLabel} · ${event.fullName}`,
        blocks,
    })
    return {
        subject: `Nuevo mensaje: ${event.topicLabel} · ${event.fullName}`,
        ...rendered,
    }
}
