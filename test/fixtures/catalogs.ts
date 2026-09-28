import { Bank } from '../../src/catalogs/entities/bank.entity.js'
import { MobilePrefix } from '../../src/catalogs/entities/mobile-prefix.entity.js'
import { OrderStatusDefinition } from '../../src/catalogs/entities/order-status-definition.entity.js'
import { OrderStatusGroup } from '../../src/catalogs/entities/order-status-group.entity.js'
import { ORDER_STATUSES } from '../../src/orders/order-status.js'
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../src/orders/whatsapp/whatsapp-template.js'

/**
 * The catalog rows the migration seeds, for the suites that stub the database. Only what the
 * tests read: admin labels, groups, a few banks (0104 is inactive) and the mobile operator codes
 * (0426 is inactive).
 */
const LABELS: Record<(typeof ORDER_STATUSES)[number], [label: string, group: string]> = {
    PENDIENTE_PAGO: ['Pendiente de pago', 'POR_PAGAR'],
    PENDIENTE_VERIFICACION: ['Pendiente por verificación', 'POR_VERIFICAR'],
    PAGO_VERIFICADO: ['Pago verificado', 'EN_CURSO'],
    PAGO_RECHAZADO: ['Pago rechazado', 'POR_PAGAR'],
    EN_PRODUCCION: ['En producción', 'EN_CURSO'],
    LISTO_PARA_ENTREGA: ['Listo para entrega', 'EN_CURSO'],
    ENVIADO: ['Enviado', 'EN_CURSO'],
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
