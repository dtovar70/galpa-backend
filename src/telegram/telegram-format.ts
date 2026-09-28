import { CARACAS_TIME_ZONE } from '../common/utils/caracas-date.js'
import { formatBs, formatUsd, formatVeNumber } from '../common/utils/money-format.js'
import type { User } from '../auth/entities/user.entity.js'
import { Role } from '../auth/role.enum.js'
import type {
    RateSnapshot,
    RateSyncFailingEvent,
    RateSyncRecoveredEvent,
} from '../exchange-rate/exchange-rate.events.js'
import type { StockConflict } from '../orders/entities/order.entity.js'
import type { PaymentSource } from '../orders/entities/order-payment.entity.js'

/** Telegram's limits: 4096 characters per message, 1024 per photo caption (after parsing). */
export const TELEGRAM_TEXT_LIMIT = 4096
export const TELEGRAM_CAPTION_LIMIT = 1024

/** Items listed in a message before "…y N más". */
const MAX_ITEM_LINES = 6
const MAX_NAME_LENGTH = 60
const MAX_PERSONALIZATION_LENGTH = 80

/** Escapes text for Telegram's HTML parse mode. Every user-provided value goes through here. */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/** "Taza con nombre largo…" (on the raw text, before escaping). */
export function truncate(value: string, max: number): string {
    const chars = [...value.trim()]
    return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('')
}

/** What Telegram counts: the text without tags, with entities decoded. */
export function visibleLength(html: string): number {
    return html
        .replace(/<[^>]+>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&').length
}

const dateTimeParts = new Intl.DateTimeFormat('en-US', {
    timeZone: CARACAS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
})

function caracasParts(date: Date): Record<string, string> {
    return Object.fromEntries(
        dateTimeParts.formatToParts(date).map((part) => [part.type, part.value]),
    )
}

/** "3:05 p. m." in Caracas time. */
export function formatCaracasTime(date: Date): string {
    const parts = caracasParts(date)
    const suffix = parts.dayPeriod?.toUpperCase() === 'PM' ? 'p. m.' : 'a. m.'
    return `${parts.hour}:${parts.minute} ${suffix}`
}

/** "25/09/2026, 3:05 p. m." in Caracas time. */
export function formatCaracasDateTime(date: Date): string {
    const parts = caracasParts(date)
    return `${parts.day}/${parts.month}/${parts.year}, ${formatCaracasTime(date)}`
}

/** "2026-09-25" (a calendar day) -> "25/09/2026". */
export function formatDay(day: string): string {
    const [year, month, date] = day.split('-')
    return year && month && date ? `${date}/${month}/${year}` : day
}

export interface MessageItem {
    quantity: number
    productName: string
    variantLabel: string | null
    personalization: string | null
}

export interface PaymentMessageData {
    code: string
    customerName: string
    customerPhone: string
    items: readonly MessageItem[]
    totalUsd: number
    totalBs: number
    exchangeRate: number
    stockConflict: StockConflict | null
    payment: {
        reference: string
        payerBankCode: string
        payerBankName: string
        payerPhone: string
        payerIdNumber: string | null
        paidOn: string
        amountBs: number
        expectedBs: number
        duplicateReference: boolean
        late: boolean
        source: PaymentSource
        /** Admin who recorded a manual payment. */
        recordedByName: string | null
        hasProof: boolean
    }
    /** `<PUBLIC_SITE_URL>/admin/pedidos/<code>`. */
    adminUrl: string
}

export function itemLines(items: readonly MessageItem[]): string[] {
    const lines = items.slice(0, MAX_ITEM_LINES).map((item) => {
        const name = escapeHtml(truncate(item.productName, MAX_NAME_LENGTH))
        const variant = item.variantLabel
            ? ` (${escapeHtml(truncate(item.variantLabel, MAX_NAME_LENGTH))})`
            : ''
        const line = `• ${item.quantity} × ${name}${variant}`
        return item.personalization
            ? `${line}\n   <i>“${escapeHtml(truncate(item.personalization, MAX_PERSONALIZATION_LENGTH))}”</i>`
            : line
    })
    const rest = items.length - MAX_ITEM_LINES
    if (rest > 0) lines.push(`<i>…y ${rest} ${rest === 1 ? 'artículo' : 'artículos'} más</i>`)
    return lines
}

/** Unresolved stock conflict lines: "«Taza» pidió 3, hay 1". */
export function stockConflictText(conflict: StockConflict | null): string | null {
    if (!conflict || conflict.resolvedAt) return null
    return conflict.lines
        .map(
            (line) =>
                `«${escapeHtml(truncate(line.productName, MAX_NAME_LENGTH))}» pidió ${line.requested}, hay ${line.available}`,
        )
        .join('; ')
}

/** Warning lines for the owner; empty when nothing looks odd. */
export function paymentWarnings(data: PaymentMessageData): string[] {
    const { payment } = data
    const warnings: string[] = []
    const difference = Math.round((payment.amountBs - payment.expectedBs) * 100) / 100
    if (difference !== 0) {
        const gap = formatBs(Math.abs(difference))
        warnings.push(
            `⚠️ <b>Monto no coincide:</b> ${difference < 0 ? `faltan ${gap}` : `sobran ${gap}`} (esperado ${formatBs(payment.expectedBs)})`,
        )
    }
    if (payment.duplicateReference) {
        warnings.push('⚠️ <b>Referencia repetida:</b> ya se usó en otro pedido activo')
    }
    if (payment.late) warnings.push('⏰ <b>Pago fuera de plazo</b>')
    const stock = stockConflictText(data.stockConflict)
    if (stock) warnings.push(`📦 <b>Stock insuficiente:</b> ${stock}`)
    return warnings
}

/**
 * The payment notification (HTML). `resolution` is appended once the payment was handled. The
 * text never exceeds Telegram's message limit (items are already capped).
 */
export function paymentMessage(
    data: PaymentMessageData,
    options: { title?: string; resolution?: string | null } = {},
): string {
    const { payment } = data
    const title = options.title ?? '🧾 <b>Nuevo pago por verificar</b>'
    const source =
        payment.source === 'admin'
            ? `🗂️ Registrado manualmente en el panel${payment.recordedByName ? ` por ${escapeHtml(payment.recordedByName)}` : ''}`
            : '🙋 Enviado por el cliente'
    const blocks = [
        [
            `${title} · <b>${escapeHtml(data.code)}</b>`,
            `👤 ${escapeHtml(data.customerName)} · ${escapeHtml(data.customerPhone)}`,
        ],
        itemLines(data.items),
        [
            `💵 <b>Total:</b> ${formatUsd(data.totalUsd)} · ${formatBs(data.totalBs)}`,
            `<i>Tasa BCV ${formatVeNumber(data.exchangeRate)}</i>`,
        ],
        [
            '💳 <b>Pago Móvil</b>',
            `Banco: ${escapeHtml(payment.payerBankName)} (${escapeHtml(payment.payerBankCode)})`,
            `Referencia: <code>${escapeHtml(payment.reference)}</code>`,
            `Teléfono: ${escapeHtml(payment.payerPhone)}${payment.payerIdNumber ? ` · ${escapeHtml(payment.payerIdNumber)}` : ''}`,
            `Fecha: ${formatDay(payment.paidOn)}`,
            `Monto pagado: <b>${formatBs(payment.amountBs)}</b>`,
        ],
        paymentWarnings(data),
        [source + (payment.hasProof ? ' · 📎 con captura' : ' · sin captura')],
    ]
    if (options.resolution) blocks.push([options.resolution])
    return blocks
        .filter((lines) => lines.length)
        .map((lines) => lines.join('\n'))
        .join('\n\n')
}

export interface NewOrderMessageData {
    code: string
    customerName: string
    totalUsd: number
    totalBs: number
    itemCount: number
    items: readonly MessageItem[]
    paymentDueAt: Date
}

export function newOrderMessage(data: NewOrderMessageData): string {
    return [
        `🛒 <b>Nuevo pedido</b> · <b>${escapeHtml(data.code)}</b>`,
        `👤 ${escapeHtml(data.customerName)}`,
        itemLines(data.items).join('\n'),
        `💵 ${formatUsd(data.totalUsd)} · ${formatBs(data.totalBs)} · ${data.itemCount} ${data.itemCount === 1 ? 'artículo' : 'artículos'}`,
        `⏳ Esperando el pago hasta el ${formatCaracasDateTime(data.paymentDueAt)}`,
    ].join('\n')
}

export interface OrderSummaryData {
    code: string
    statusLabel: string
    customerName: string
    customerPhone: string
    items: readonly MessageItem[]
    totalUsd: number
    totalBs: number
    createdAt: Date
    deliveryMethod: 'delivery' | 'pickup'
    latestPayment: { reference: string; amountBs: number; statusLabel: string } | null
}

export function orderSummaryMessage(data: OrderSummaryData): string {
    const lines = [
        `📦 <b>${escapeHtml(data.code)}</b> · ${escapeHtml(data.statusLabel)}`,
        `👤 ${escapeHtml(data.customerName)} · ${escapeHtml(data.customerPhone)}`,
        `🗓️ ${formatCaracasDateTime(data.createdAt)} · ${data.deliveryMethod === 'pickup' ? 'Retiro en el taller' : 'Envío a domicilio'}`,
        '',
        itemLines(data.items).join('\n'),
        '',
        `💵 <b>Total:</b> ${formatUsd(data.totalUsd)} · ${formatBs(data.totalBs)}`,
    ]
    if (data.latestPayment) {
        lines.push(
            `💳 Último pago: ref. <code>${escapeHtml(data.latestPayment.reference)}</code> · ${formatBs(data.latestPayment.amountBs)} · ${escapeHtml(data.latestPayment.statusLabel)}`,
        )
    }
    return lines.join('\n')
}

/** The rate line of the sync alerts: "Tasa actual: 36,5000 Bs/$ (fecha valor 25/09/2026)". */
function currentRateLine(current: RateSnapshot | null): string {
    return current
        ? `Tasa actual: <b>${formatVeNumber(current.rate, 4)} Bs/$</b> (fecha valor ${formatDay(current.effectiveDate)})`
        : 'Todavía no hay ninguna tasa guardada.'
}

/** Sent once when the automatic rate sync keeps failing. */
export function rateSyncFailingMessage(event: RateSyncFailingEvent): string {
    const { current } = event
    const pause = !current
        ? '⛔ La tienda no puede recibir pedidos hasta que haya una tasa.'
        : current.isStale
          ? '⛔ <b>Los pedidos ya están pausados</b>: la tasa guardada venció.'
          : `⏳ Si no llega una tasa nueva, <b>los pedidos se pausan el ${formatCaracasDateTime(new Date(current.usableUntil))}</b>.`
    return [
        '⚠️ <b>No se pudo obtener la tasa del BCV</b>',
        `Fallaron ${event.consecutiveFailures} intentos seguidos (BCV y DolarApi).`,
        currentRateLine(current),
        pause,
        'Puedes cargarla a mano en el panel, sección <b>Tasa BCV</b>.',
    ].join('\n')
}

/** Sent once when a sync succeeds after the failing alert. */
export function rateSyncRecoveredMessage(event: RateSyncRecoveredEvent): string {
    const lines = ['✅ <b>La tasa del BCV se volvió a obtener</b>', currentRateLine(event.current)]
    if (event.current?.isStale) {
        lines.push('⚠️ Esa tasa sigue vencida: los pedidos siguen pausados.')
    }
    return lines.join('\n')
}

export const HELP_TEXT = [
    '<b>Comandos</b>',
    '/pendientes — pagos por verificar',
    '/pedido MR-000012 — resumen de un pedido',
    '/micuenta — tu cuenta del panel vinculada a este chat',
    '/ayuda — esta ayuda',
    '/salir — desvincular este chat',
].join('\n')

export const WELCOME_MESSAGE = [
    '🐾 <b>¡Listo! Este chat quedó vinculado a Manada Russo.</b>',
    '',
    'Te voy a avisar cada vez que llegue un pago por verificar, y podrás confirmarlo o rechazarlo desde aquí mismo. Todo queda sincronizado con el panel web.',
    '',
    HELP_TEXT,
].join('\n')

export const PRIVATE_BOT_MESSAGE =
    '🔒 Hola, este es un bot privado del equipo de Manada Russo. Si trabajas con nosotros, pide un código de vinculación en el panel de administración (sección Telegram) y envíalo así: /start 123456'

const ROLE_LABELS: Record<Role, string> = {
    [Role.ADMIN]: 'Administrador',
    [Role.EDITOR]: 'Editor',
}

/** `/micuenta`: the panel account that linked this chat. */
export function accountMessage(
    user: Pick<User, 'name' | 'email' | 'role' | 'isActive'> | null,
): string {
    if (!user) {
        return 'Este chat no está asociado a ninguna cuenta del panel. Vincúlalo de nuevo desde el panel (sección Telegram).'
    }
    return [
        '👤 <b>Cuenta del panel vinculada a este chat</b>',
        `Nombre: ${escapeHtml(user.name)}`,
        `Correo: ${escapeHtml(user.email)}`,
        `Rol: ${ROLE_LABELS[user.role] ?? escapeHtml(user.role)}`,
        `Estado: ${user.isActive ? 'Activa ✅' : 'Inactiva'}`,
        '',
        'Si olvidas tu contraseña, en la página de inicio de sesión toca “¿Olvidaste tu contraseña?” y te enviaré aquí un código.',
    ].join('\n')
}
