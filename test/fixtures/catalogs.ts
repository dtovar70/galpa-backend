import { Bank } from '../../src/catalogs/entities/bank.entity.js'
import {
    ContactTopicOption,
    SpaceTypeOption,
} from '../../src/catalogs/entities/contact-option.entity.js'
import { MobilePrefix } from '../../src/catalogs/entities/mobile-prefix.entity.js'
import { OrderStatusDefinition } from '../../src/catalogs/entities/order-status-definition.entity.js'
import { OrderStatusGroup } from '../../src/catalogs/entities/order-status-group.entity.js'
import { PaymentMethodDefinition } from '../../src/catalogs/entities/payment-method-definition.entity.js'
import { QuoteStatusDefinition } from '../../src/catalogs/entities/quote-status-definition.entity.js'
import { ORDER_STATUSES } from '../../src/orders/order-status.js'
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../src/orders/whatsapp/whatsapp-template.js'
import { QUOTE_STATUSES } from '../../src/quotes/quote-status.js'

/**
 * The catalog rows the migrations seed, for the suites that stub the database. Only what the
 * tests read: admin labels, groups, quote statuses, payment methods, a few banks (0104 is
 * inactive), the mobile operator codes (0426 is inactive) and the contact form options (the
 * extra topic GARANTIA and space type INDUSTRIAL are inactive).
 */
const LABELS: Record<(typeof ORDER_STATUSES)[number], [label: string, group: string]> = {
    PENDIENTE_PAGO: ['Pendiente de pago', 'POR_PAGAR'],
    PENDIENTE_VERIFICACION: ['Comprobante por verificar', 'POR_VERIFICAR'],
    PAGO_VERIFICADO: ['Pago aprobado', 'EN_CURSO'],
    PAGO_RECHAZADO: ['Pago rechazado', 'POR_PAGAR'],
    ESPERANDO_MERCANCIA: ['Esperando mercancía (bajo pedido)', 'EN_CURSO'],
    EN_PREPARACION: ['Preparando despacho', 'EN_CURSO'],
    LISTO_PARA_RETIRO: ['Listo para retiro', 'EN_CURSO'],
    DESPACHADO: ['Despachado', 'EN_CURSO'],
    ENTREGADO: ['Entregado', 'CERRADOS'],
    CANCELADO: ['Cancelado', 'CERRADOS'],
    EXPIRADO: ['Expirado', 'CERRADOS'],
}

export function orderStatusRows(): OrderStatusDefinition[] {
    return ORDER_STATUSES.map((code, index) => {
        const [label, groupCode] = LABELS[code]
        return {
            code,
            label,
            customerLabel: label,
            customerTitle: null,
            customerDescription: null,
            groupCode,
            tone: 'neutral',
            sortOrder: index,
            isTerminal: groupCode === 'CERRADOS',
            whatsappTemplate: DEFAULT_WHATSAPP_TEMPLATES[code],
        } as OrderStatusDefinition
    })
}

export function orderStatusGroupRows(): OrderStatusGroup[] {
    return [
        ['POR_VERIFICAR', 'Por verificar', true],
        ['POR_PAGAR', 'Por pagar', false],
        ['EN_CURSO', 'En curso', false],
        ['CERRADOS', 'Cerrados', false],
    ].map(
        ([code, label, highlight], index) =>
            ({ code, label, description: null, sortOrder: index, highlight }) as OrderStatusGroup,
    )
}

const QUOTE_STATUS_ROWS: Record<
    (typeof QUOTE_STATUSES)[number],
    [label: string, tone: QuoteStatusDefinition['tone'], isTerminal: boolean]
> = {
    BORRADOR: ['Borrador', 'neutral', false],
    ENVIADA: ['Enviada', 'info', false],
    ACEPTADA: ['Aceptada', 'brand', false],
    CONVERTIDA: ['Convertida en pedido', 'solid', true],
    RECHAZADA: ['Rechazada', 'danger', true],
    VENCIDA: ['Vencida', 'warning', false],
}

export function quoteStatusRows(): QuoteStatusDefinition[] {
    return QUOTE_STATUSES.map((code, sortOrder) => {
        const [label, tone, isTerminal] = QUOTE_STATUS_ROWS[code]
        return {
            code,
            label,
            description: `Qué significa «${label}».`,
            tone,
            sortOrder,
            isTerminal,
            updatedAt: new Date('2026-01-01T00:00:00Z'),
        }
    })
}

export function paymentMethodRows(): PaymentMethodDefinition[] {
    const rows = [
        ['PAGO_MOVIL', 'Pago Móvil', 'En bolívares, a la tasa BCV del día.', 'smartphone'],
        [
            'TRANSFERENCIA',
            'Transferencia bancaria',
            'En bolívares, a la tasa BCV del día.',
            'building',
        ],
        ['ZELLE', 'Zelle', 'En dólares, desde tu cuenta en EE. UU.', 'dollar-sign'],
        ['BINANCE', 'Binance Pay', 'En dólares (USDT) con Binance Pay.', 'bitcoin'],
    ] as const
    return rows.map(([code, label, description, icon], sortOrder) => ({
        code,
        label,
        description,
        icon,
        sortOrder,
        updatedAt: new Date('2026-01-01T00:00:00Z'),
    }))
}

function contactOptionRows(rows: readonly (readonly [string, string, boolean])[]) {
    return rows.map(([code, label, isActive], sortOrder) => ({
        code,
        label,
        isActive,
        sortOrder,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
    }))
}

export function contactTopicRows(): ContactTopicOption[] {
    return contactOptionRows([
        ['ASESORIA', 'Quiero asesoría para elegir un equipo', true],
        ['COTIZACION', 'Necesito una cotización', true],
        ['SOPORTE', 'Soporte, repuestos o garantía', true],
        ['OTRO', 'Otro tema', true],
        ['GARANTIA', 'Garantía', false],
    ])
}

export function spaceTypeRows(): SpaceTypeOption[] {
    return contactOptionRows([
        ['RESIDENCIAL', 'Residencial (hogar)', true],
        ['COMERCIAL', 'Comercial (oficina, local, industria)', true],
        ['INDUSTRIAL', 'Industrial', false],
    ])
}

export function bankRows(): Bank[] {
    return [
        { code: '0102', name: 'Banco de Venezuela', isActive: true, sortOrder: 0 },
        { code: '0104', name: 'Venezolano de Crédito', isActive: false, sortOrder: 1 },
        { code: '0134', name: 'Banesco', isActive: true, sortOrder: 2 },
    ]
}

export function mobilePrefixRows(): MobilePrefix[] {
    return [
        ['0412', true],
        ['0414', true],
        ['0416', true],
        ['0422', true],
        ['0424', true],
        ['0426', false],
    ].map(([code, isActive], sortOrder) => ({
        code: code as string,
        isActive: isActive as boolean,
        sortOrder,
    }))
}

/** Seeded rows of a catalog entity, or undefined for any other entity. */
export function catalogRows(entity: unknown): object[] | undefined {
    if (entity === OrderStatusDefinition) return orderStatusRows()
    if (entity === OrderStatusGroup) return orderStatusGroupRows()
    if (entity === QuoteStatusDefinition) return quoteStatusRows()
    if (entity === PaymentMethodDefinition) return paymentMethodRows()
    if (entity === ContactTopicOption) return contactTopicRows()
    if (entity === SpaceTypeOption) return spaceTypeRows()
    if (entity === Bank) return bankRows()
    if (entity === MobilePrefix) return mobilePrefixRows()
    return undefined
}

function matches(row: object, where: object = {}): boolean {
    return Object.entries(where).every(
        ([key, value]) => (row as Record<string, unknown>)[key] === value,
    )
}

/**
 * A read-only repository over the seeded rows of a catalog entity, or undefined for any other
 * entity. Enough for the startup check, the public catalogs, the bank checks and status edits
 * (kept for the life of the repository).
 */
export function catalogRepository(entity: unknown) {
    const rows = catalogRows(entity)
    if (!rows) return undefined
    return {
        find: (options: { where?: object } = {}) =>
            Promise.resolve(rows.filter((row) => matches(row, options.where))),
        findOne: (options: { where?: object } = {}) =>
            Promise.resolve(rows.find((row) => matches(row, options.where)) ?? null),
        findOneBy: (where: object) =>
            Promise.resolve(rows.find((row) => matches(row, where)) ?? null),
        existsBy: (where: object) => Promise.resolve(rows.some((row) => matches(row, where))),
        update: (where: object, changes: object) => {
            for (const row of rows.filter((candidate) => matches(candidate, where))) {
                Object.assign(row, changes)
            }
            return Promise.resolve({})
        },
    }
}
