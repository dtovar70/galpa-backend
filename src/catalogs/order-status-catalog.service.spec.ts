import { BadRequestException, Logger } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { Repository } from 'typeorm'
import { orderStatusGroupRows, orderStatusRows } from '../../test/fixtures/catalogs.js'
import type { Env } from '../config/env.schema.js'
import { bankInUseMessage } from './banks.service.js'
import type { OrderStatusDefinition } from './entities/order-status-definition.entity.js'
import type { OrderStatusGroup } from './entities/order-status-group.entity.js'
import {
    diffStatusCodes,
    OrderStatusCatalogService,
    prettifyStatusCode,
} from './order-status-catalog.service.js'

function setup(options: { rows?: OrderStatusDefinition[]; env?: Env['NODE_ENV'] } = {}) {
    const rows = options.rows ?? orderStatusRows()
    const statuses = {
        find: vi.fn(() => Promise.resolve(rows)),
        existsBy: vi.fn(({ code }: { code: string }) =>
            Promise.resolve(rows.some((row) => row.code === code)),
        ),
        update: vi.fn(({ code }: { code: string }, changes: Partial<OrderStatusDefinition>) => {
            Object.assign(rows.find((row) => row.code === code) ?? {}, changes)
            return Promise.resolve({ affected: 1 })
        }),
    }
    const groups = {
        find: vi.fn(() => Promise.resolve(orderStatusGroupRows())),
        existsBy: vi.fn(() => Promise.resolve(true)),
        update: vi.fn(() => Promise.resolve({ affected: 1 })),
    }
    const config = { get: vi.fn(() => options.env ?? 'development') }
    const service = new OrderStatusCatalogService(
        statuses as unknown as Repository<OrderStatusDefinition>,
        groups as unknown as Repository<OrderStatusGroup>,
        config as unknown as ConfigService<Env, true>,
    )
    return { service, statuses, groups }
}

describe('order status catalog', () => {
    beforeEach(() => {
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('diffs the table codes against ORDER_STATUSES', () => {
        expect(diffStatusCodes(['A', 'B', 'X'], ['A', 'B', 'C'])).toEqual({
            missing: ['C'],
            unknown: ['X'],
        })
        expect(diffStatusCodes(orderStatusRows().map((row) => row.code))).toEqual({
            missing: [],
            unknown: [],
        })
    })

    it('starts when the table holds exactly the known codes', async () => {
        const { service } = setup()
        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()
        expect(Logger.prototype.error).not.toHaveBeenCalled()
    })

    it('fails fast outside production when a code is missing or unknown', async () => {
        const rows = orderStatusRows().filter((row) => row.code !== 'DESPACHADO')
        rows.push({ ...rows[0]!, code: 'DEVUELTO' })
        const { service } = setup({ rows })

        await expect(service.onApplicationBootstrap()).rejects.toThrow(
            'The order status catalog does not match ORDER_STATUSES (missing in order_statuses: DESPACHADO; unknown to the code (ORDER_STATUSES): DEVUELTO).',
        )
        expect(Logger.prototype.error).toHaveBeenCalledOnce()
    })

    it('only logs the mismatch in production', async () => {
        const { service } = setup({ rows: [], env: 'production' })
        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()
        expect(Logger.prototype.error).toHaveBeenCalledOnce()
    })

    it('labels statuses from the table and prettifies a missing row', async () => {
        const rows = orderStatusRows().filter((row) => row.code !== 'EXPIRADO')
        const { service } = setup({ rows, env: 'production' })
        const label = await service.labeler()
        expect(label('PENDIENTE_VERIFICACION')).toBe('Comprobante por verificar')
        expect(label('EXPIRADO')).toBe('Expirado')
        expect(prettifyStatusCode('LISTO_PARA_RETIRO')).toBe('Listo para retiro')
    })

    it('caches the catalog and reloads it after an admin edit', async () => {
        const { service, statuses } = setup()
        await service.getCatalog()
        await service.getCatalog()
        expect(statuses.find).toHaveBeenCalledTimes(1)

        const catalog = await service.updateStatus('DESPACHADO', {
            label: 'En ruta',
            customerTitle: '',
        })
        expect(statuses.update).toHaveBeenCalledWith(
            { code: 'DESPACHADO' },
            { label: 'En ruta', customerTitle: null },
        )
        expect(statuses.find).toHaveBeenCalledTimes(2)
        expect(catalog.statuses.find((status) => status.code === 'DESPACHADO')?.label).toBe(
            'En ruta',
        )
        expect((await service.labeler())('DESPACHADO')).toBe('En ruta')
    })

    it('groups the statuses under their tab, in status order', async () => {
        const { service } = setup()
        const { groups } = await service.getCatalog()
        expect(groups.find((group) => group.code === 'EN_CURSO')?.statuses).toEqual([
            'PAGO_VERIFICADO',
            'ESPERANDO_MERCANCIA',
            'EN_PREPARACION',
            'LISTO_PARA_RETIRO',
            'DESPACHADO',
        ])
    })

    it('refuses an edit with nothing to change', async () => {
        const { service, groups } = setup()
        await expect(service.updateGroup('CERRADOS', {})).rejects.toBeInstanceOf(
            BadRequestException,
        )
        expect(groups.update).not.toHaveBeenCalled()
    })
})

describe('bankInUseMessage', () => {
    it('explains every reference, or returns null when the bank is unused', () => {
        expect(bankInUseMessage({ paymentCount: 0, usedByPaymentContent: false })).toBeNull()
        expect(bankInUseMessage({ paymentCount: 1, usedByPaymentContent: false })).toBe(
            'No puedes eliminar este banco porque lo usa 1 pago registrado. Desactívalo para ocultarlo.',
        )
        expect(bankInUseMessage({ paymentCount: 0, usedByPaymentContent: true })).toBe(
            'No puedes eliminar este banco porque es el banco de tus datos de pago. Desactívalo para ocultarlo.',
        )
    })
})
