import { PAYMENT_METHOD_LABELS, paysInBolivars } from '../../common/payment-methods.js'
import { formatCaracasDateTime, formatDay } from '../../common/utils/caracas-date.js'
import { formatBs, formatUsd, formatVeNumber } from '../../common/utils/money-format.js'
import {
    isMethodConfigured,
    type ContactContent,
    type PaymentContent,
} from '../../content/content.types.js'
import { renderEmail, type EmailBlock, type EmailInline } from '../../mail/email-layout.js'
import type { OrderItem } from '../entities/order-item.entity.js'
import type { Order } from '../entities/order.entity.js'
import type { OrderStatus } from '../order-status.js'
import { firstName, toWhatsAppPhone } from '../whatsapp/whatsapp-template.js'

/** A rendered customer email (the recipient is added by the sender). */
export interface OrderEmail {
    subject: string
    html: string
    text: string
}

/** What every order email needs from the site content. */
export interface OrderEmailShop {
    brandName: string
    contact: ContactContent
}

export type OrderReceivedData = Pick<
    Order,
    | 'code'
    | 'customerName'
    | 'deliveryMethod'
    | 'address'
    | 'city'
    | 'paymentMethod'
    | 'hasOnOrderItems'
    | 'wantsInstallation'
    | 'subtotalUsd'
    | 'discountUsd'
    | 'shippingUsd'
    | 'totalUsd'
    | 'totalBs'
    | 'exchangeRate'
    | 'exchangeRateDate'
    | 'paymentDueAt'
> & {
    items: Pick<
        OrderItem,
        | 'productId'
        | 'productName'
        | 'variantLabel'
        | 'brand'
        | 'model'
        | 'stockMode'
        | 'quantity'
        | 'unitPriceUsd'
        | 'lineTotalUsd'
        | 'sortOrder'
    >[]
}

export const DELIVERY_METHOD_LABELS = {
    delivery: 'Envío a domicilio',
    pickup: 'Retiro en tienda',
} as const

/** "¿Dudas? Responde este correo o escríbenos por WhatsApp." (WhatsApp only when set). */
function helpParagraph(contact: ContactContent): EmailBlock {
    const whatsapp = toWhatsAppPhone(contact.whatsapp)
    const parts: EmailInline[] = whatsapp
        ? [
              '¿Tienes alguna duda? Responde este correo o escríbenos por ',
              { href: `https://wa.me/${whatsapp}`, label: `WhatsApp (${contact.whatsapp.trim()})` },
              ' y con gusto te ayudamos.',
          ]
        : ['¿Tienes alguna duda? Responde este correo y con gusto te ayudamos.']
    return { kind: 'paragraph', parts }
}

function itemsBlock(items: OrderReceivedData['items']): EmailBlock {
    return {
        kind: 'items',
        items: [...items]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((item) => {
                const brandModel = [item.brand, item.model].filter(Boolean).join(' · ')
                return {
                    title: item.variantLabel
                        ? `${item.productName} · ${item.variantLabel}`
                        : item.productName,
                    details: [
                        ...(brandModel ? [brandModel] : []),
                        `Cantidad: ${item.quantity} × ${formatUsd(item.unitPriceUsd)}`,
                        ...(item.productId && item.stockMode === 'ON_ORDER' ? ['Bajo pedido'] : []),
                    ],
                    amount: formatUsd(item.lineTotalUsd),
                }
            }),
    }
}

/** The amount to pay with the order's method, formatted ("Bs. 1.234,56" or "$120,00"). */
export function amountToPay(order: Pick<Order, 'paymentMethod' | 'totalBs' | 'totalUsd'>): string {
    return paysInBolivars(order.paymentMethod) ? formatBs(order.totalBs) : formatUsd(order.totalUsd)
}

/** The rows of the store's account for the order's method (where to send the money). */
function paymentRows(
    order: OrderReceivedData,
    payment: PaymentContent,
): { label: string; value: string; strong?: boolean }[] {
    const amount = { label: 'Monto exacto', value: amountToPay(order), strong: true }
    const concept = { label: 'Concepto', value: `Pedido ${order.code}` }
    switch (order.paymentMethod) {
        case 'PAGO_MOVIL': {
            const account = payment.pagoMovil
            return [
                { label: 'Banco', value: `${account.bankCode} - ${account.bankName}` },
                { label: 'Teléfono', value: account.phone },
                { label: 'Cédula / RIF', value: account.idNumber },
                { label: 'Titular', value: account.holderName },
                amount,
                concept,
            ]
        }
        case 'TRANSFERENCIA': {
            const account = payment.transfer
            return [
                { label: 'Banco', value: `${account.bankCode} - ${account.bankName}` },
                {
                    label:
                        account.accountType === 'AHORRO' ? 'Cuenta de ahorro' : 'Cuenta corriente',
                    value: account.accountNumber,
                },
                { label: 'Cédula / RIF', value: account.idNumber },
                { label: 'Titular', value: account.holderName },
                amount,
                concept,
            ]
        }
        case 'ZELLE':
            return [
                { label: 'Correo Zelle', value: payment.zelle.email },
                { label: 'Titular', value: payment.zelle.holderName },
                amount,
                concept,
            ]
        case 'BINANCE':
            return [
                { label: 'Binance Pay ID', value: payment.binance.payId },
                ...(payment.binance.email
                    ? [{ label: 'Correo Binance', value: payment.binance.email }]
                    : []),
                ...(payment.binance.holderName
                    ? [{ label: 'Titular', value: payment.binance.holderName }]
                    : []),
                amount,
                concept,
            ]
    }
}

function paymentBlocks(order: OrderReceivedData, payment: PaymentContent): EmailBlock[] {
    const method = PAYMENT_METHOD_LABELS[order.paymentMethod]
    if (!isMethodConfigured(payment, order.paymentMethod)) {
        return [
            {
                kind: 'paragraph',
                parts: [
                    `Escríbenos para coordinar tu pago por ${method} y te pasamos los datos. Recuerda indicar tu número de pedido `,
                    { bold: order.code },
                    '.',
                ],
            },
        ]
    }
    const blocks: EmailBlock[] = [
        {
            kind: 'rows',
            title: `Datos para tu pago por ${method}`,
            rows: paymentRows(order, payment),
        },
    ]
    if (payment.instructions.trim()) {
        blocks.push({ kind: 'note', parts: [payment.instructions.trim()] })
    }
    return blocks
}

function deliveryBlock(order: OrderReceivedData): EmailBlock {
    const rows: { label: string; value: string }[] = [
        { label: 'Método', value: DELIVERY_METHOD_LABELS[order.deliveryMethod] },
    ]
    if (order.deliveryMethod === 'delivery') {
        rows.push({
            label: 'Dirección',
            value: [order.address, order.city]
                .map((part) => part.trim())
                .filter(Boolean)
                .join(', '),
        })
    }
    if (order.wantsInstallation) {
        rows.push({ label: 'Instalación', value: 'Te contactaremos para coordinarla' })
    }
    return { kind: 'rows', title: 'Entrega', rows }
}

/** "Pedido recibido": sent once, right after checkout, with a fresh private link. */
export function orderReceivedEmail(
    order: OrderReceivedData,
    payment: PaymentContent,
    link: string,
    shop: OrderEmailShop,
): OrderEmail {
    const deadline = formatCaracasDateTime(order.paymentDueAt)
    const method = PAYMENT_METHOD_LABELS[order.paymentMethod]
    const inBolivars = paysInBolivars(order.paymentMethod)
    const shipping =
        order.deliveryMethod === 'pickup'
            ? 'Sin costo (retiro)'
            : order.shippingUsd === 0
              ? 'Gratis'
              : formatUsd(order.shippingUsd)
    const blocks: EmailBlock[] = [
        { kind: 'heading', text: `¡Gracias por tu pedido, ${firstName(order.customerName)}!` },
        {
            kind: 'paragraph',
            parts: [
                'Recibimos tu pedido ',
                { bold: order.code },
                ` y ya lo apartamos para ti. Para confirmarlo solo falta tu pago por ${method}.`,
            ],
        },
        itemsBlock(order.items),
        ...(order.hasOnOrderItems
            ? [
                  {
                      kind: 'note',
                      parts: [
                          'Algunos productos de tu pedido son bajo pedido: los solicitamos al proveedor cuando confirmemos tu pago y te avisamos apenas lleguen a nuestro almacén.',
                      ],
                  } satisfies EmailBlock,
              ]
            : []),
        {
            kind: 'rows',
            rows: [
                { label: 'Subtotal', value: formatUsd(order.subtotalUsd) },
                ...(order.discountUsd > 0
                    ? [{ label: 'Descuento', value: `-${formatUsd(order.discountUsd)}` }]
                    : []),
                { label: 'Envío', value: shipping },
                { label: 'Total', value: formatUsd(order.totalUsd), strong: !inBolivars },
                ...(inBolivars
                    ? [
                          {
                              label: 'Total en bolívares',
                              value: formatBs(order.totalBs),
                              strong: true,
                          },
                          {
                              label: `Tasa BCV del ${formatDay(order.exchangeRateDate)}`,
                              value: `${formatVeNumber(order.exchangeRate, 4)} Bs/$`,
                          },
                      ]
                    : []),
            ],
        },
        ...paymentBlocks(order, payment),
        {
            kind: 'paragraph',
            parts: [
                'Tienes hasta el ',
                { bold: `${deadline} (hora de Venezuela)` },
                inBolivars
                    ? ' para pagar; el monto en bolívares se mantiene durante todo ese plazo. Cuando pagues, sube tu comprobante desde la página de tu pedido.'
                    : ' para pagar. Cuando pagues, sube tu comprobante desde la página de tu pedido.',
            ],
        },
        deliveryBlock(order),
        { kind: 'button', href: link, label: 'Ver mi pedido' },
        {
            kind: 'note',
            parts: [
                'Este enlace es privado: con él ves el estado de tu pedido, cambias el método de pago y subes tu comprobante. No lo compartas.',
            ],
        },
        helpParagraph(shop.contact),
    ]
    const rendered = renderEmail({
        brandName: shop.brandName,
        contact: shop.contact,
        preheader: `Total ${amountToPay(order)}. Paga por ${method} antes del ${deadline}.`,
        blocks,
    })
    return { subject: `Recibimos tu pedido ${order.code}`, ...rendered }
}

/** "Consultar mi pedido": a fresh private link, sent only to the order's own email. */
export function orderLinkEmail(
    order: Pick<Order, 'code' | 'customerName'>,
    link: string,
    shop: OrderEmailShop,
): OrderEmail {
    const blocks: EmailBlock[] = [
        { kind: 'heading', text: `Hola, ${firstName(order.customerName)}` },
        {
            kind: 'paragraph',
            parts: [
                'Nos pediste el enlace de tu pedido ',
                { bold: order.code },
                '. Tócalo para ver su estado, los datos de pago o subir tu comprobante.',
            ],
        },
        { kind: 'button', href: link, label: 'Ver mi pedido' },
        {
            kind: 'note',
            parts: [
                'Este enlace es privado: no lo compartas. Si no lo pediste tú, ignora este correo; nadie puede ver tu pedido sin él.',
            ],
        },
        helpParagraph(shop.contact),
    ]
    const rendered = renderEmail({
        brandName: shop.brandName,
        contact: shop.contact,
        preheader: `El enlace privado de tu pedido ${order.code}.`,
        blocks,
    })
    return { subject: `Tu enlace para ver el pedido ${order.code}`, ...rendered }
}

/** Statuses that send the customer an email when the order reaches them. */
export const STATUS_EMAIL_STATUSES = [
    'PAGO_VERIFICADO',
    'PAGO_RECHAZADO',
    'ESPERANDO_MERCANCIA',
    'LISTO_PARA_RETIRO',
    'DESPACHADO',
    'ENTREGADO',
    'CANCELADO',
    'EXPIRADO',
] as const satisfies readonly OrderStatus[]

export type StatusEmailStatus = (typeof STATUS_EMAIL_STATUSES)[number]

export function isStatusEmailStatus(status: OrderStatus): status is StatusEmailStatus {
    return (STATUS_EMAIL_STATUSES as readonly OrderStatus[]).includes(status)
}

interface StatusCopy {
    subject: string
    heading: string
    /** `{code}` is replaced by the order code (in bold). */
    body: string
    /** Label of the note row (reason, tracking), when the status carries one. */
    noteLabel?: string
    /** A last paragraph specific to the status. */
    closing?: string
}

const STATUS_COPY: Record<StatusEmailStatus, StatusCopy> = {
    PAGO_VERIFICADO: {
        subject: 'Pago aprobado',
        heading: '¡Pago aprobado!',
        body: 'Confirmamos el pago de tu pedido {code}. Ya estamos trabajando en él y te avisaremos en cada paso.',
    },
    PAGO_RECHAZADO: {
        subject: 'Necesitamos revisar tu pago',
        heading: 'Necesitamos revisar tu pago',
        body: 'No pudimos confirmar el pago de tu pedido {code}.',
        noteLabel: 'Motivo',
        closing:
            'Revisa los datos y envía un nuevo comprobante desde la página de tu pedido. Si lo prefieres, también puedes elegir otro método de pago.',
    },
    ESPERANDO_MERCANCIA: {
        subject: 'Tu equipo viene en camino a nuestro almacén',
        heading: 'Tu equipo viene en camino',
        body: 'Ya solicitamos los productos bajo pedido de tu pedido {code} a nuestro proveedor. Te avisaremos apenas lleguen a nuestro almacén.',
    },
    LISTO_PARA_RETIRO: {
        subject: 'Tu pedido está listo para retirar',
        heading: '¡Listo para retirar!',
        body: 'Tu pedido {code} ya está listo para retirar en nuestra tienda.',
        noteLabel: 'Nota',
        closing: 'Trae tu número de pedido y un documento de identidad al retirarlo.',
    },
    DESPACHADO: {
        subject: 'Tu pedido va en camino',
        heading: 'Tu pedido va en camino',
        body: 'Despachamos tu pedido {code}.',
        noteLabel: 'Datos del envío',
    },
    ENTREGADO: {
        subject: 'Pedido entregado',
        heading: '¡Gracias por tu compra!',
        body: 'Tu pedido {code} fue entregado. Esperamos que disfrutes tu compra.',
        closing:
            'Conserva tu comprobante de compra: lo necesitarás para cualquier garantía. Si necesitas instalación o mantenimiento, escríbenos.',
    },
    CANCELADO: {
        subject: 'Tu pedido fue cancelado',
        heading: 'Tu pedido fue cancelado',
        body: 'Cancelamos tu pedido {code}.',
        noteLabel: 'Motivo',
        closing: 'Si ya habías pagado, escríbenos para coordinar la devolución.',
    },
    EXPIRADO: {
        subject: 'Tu pedido expiró',
        heading: 'Tu pedido expiró',
        body: 'No recibimos el pago de tu pedido {code} dentro del plazo, así que liberamos los productos que tenías apartados.',
        closing:
            'Si ya pagaste, sube tu comprobante desde la página de tu pedido o escríbenos y lo revisamos.',
    },
}

/**
 * A status change the customer should hear about (see `STATUS_EMAIL_STATUSES`), with a fresh
 * private link. `note` is the reason or the shipping details, when the status carries one.
 */
export function orderStatusEmail(
    order: Pick<Order, 'code' | 'customerName' | 'hasOnOrderItems'>,
    status: StatusEmailStatus,
    note: string | null,
    link: string,
    shop: OrderEmailShop,
): OrderEmail {
    const copy = STATUS_COPY[status]
    const [before, after] = copy.body.split('{code}')
    const blocks: EmailBlock[] = [
        { kind: 'heading', text: copy.heading },
        { kind: 'paragraph', parts: [`Hola, ${firstName(order.customerName)}.`] },
        {
            kind: 'paragraph',
            parts: after === undefined ? [copy.body] : [before ?? '', { bold: order.code }, after],
        },
    ]
    if (copy.noteLabel && note?.trim()) {
        blocks.push({ kind: 'rows', rows: [{ label: copy.noteLabel, value: note.trim() }] })
    }
    if (status === 'PAGO_VERIFICADO' && order.hasOnOrderItems) {
        blocks.push({
            kind: 'note',
            parts: [
                'Tu pedido incluye productos bajo pedido: los solicitaremos al proveedor y te avisaremos cuando lleguen.',
            ],
        })
    }
    if (copy.closing) blocks.push({ kind: 'paragraph', parts: [copy.closing] })
    blocks.push({ kind: 'button', href: link, label: 'Ver mi pedido' }, helpParagraph(shop.contact))
    const rendered = renderEmail({
        brandName: shop.brandName,
        contact: shop.contact,
        preheader: `${copy.subject} · pedido ${order.code}`,
        blocks,
    })
    return { subject: `${copy.subject} · ${order.code}`, ...rendered }
}
