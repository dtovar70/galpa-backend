import { BadRequestException, Logger, NotFoundException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { Repository } from 'typeorm'
import { paymentMethodRows } from '../../test/fixtures/catalogs.js'
import type { Env } from '../config/env.schema.js'
import type { PaymentMethodDefinition } from './entities/payment-method-definition.entity.js'
import { PaymentMethodCatalogService } from './payment-method-catalog.service.js'

function setup(options: { rows?: PaymentMethodDefinition[]; env?: Env['NODE_ENV'] } = {}) {
    const rows = options.rows ?? paymentMethodRows()
    const update = (where: { code: string }, changes: Partial<PaymentMethodDefinition>) => {
        Object.assign(rows.find((row) => row.code === where.code) ?? {}, changes)
        return Promise.resolve({ affected: 1 })
    }
    const methods = {
        find: vi.fn(() => Promise.resolve(rows)),
        existsBy: vi.fn(({ code }: { code: string }) =>
            Promise.resolve(rows.some((row) => row.code === code)),
        ),
        update: vi.fn(update),
        manager: {
            transaction: <T>(work: (manager: unknown) => Promise<T>) =>
                work({
                    find: () => Promise.resolve(rows),
                    update: (
                        _: unknown,
                        ...args: [{ code: string }, Partial<PaymentMethodDefinition>]
                    ) => update(...args),
                }),
        },
    }
    const config = { get: vi.fn(() => options.env ?? 'development') }
    const service = new PaymentMethodCatalogService(
        methods as unknown as Repository<PaymentMethodDefinition>,
        config as unknown as ConfigService<Env, true>,
    )
    return { service, methods, rows }
}

describe('payment method catalog', () => {
    beforeEach(() => {
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('starts when the table holds exactly the known codes', async () => {
        const { service } = setup()
        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()
        expect(Logger.prototype.error).not.toHaveBeenCalled()
    })

    it('fails fast outside production when a code is missing or unknown', async () => {
        const rows = paymentMethodRows().filter((row) => row.code !== 'BINANCE')
        rows.push({ ...rows[0]!, code: 'PAYPAL' })
        const { service } = setup({ rows })
        await expect(service.onApplicationBootstrap()).rejects.toThrow(
            'The payment method catalog does not match PAYMENT_METHODS (missing in payment_methods: BINANCE; unknown to the code (PAYMENT_METHODS): PAYPAL).',
        )
    })

    it('only logs the mismatch in production', async () => {
        const { service } = setup({ rows: [], env: 'production' })
        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()
        expect(Logger.prototype.error).toHaveBeenCalledOnce()
    })

    it('sorts the methods, adds the currency and prettifies a missing name', async () => {
        const rows = paymentMethodRows().reverse()
        rows.splice(
            rows.findIndex((row) => row.code === 'PAGO_MOVIL'),
            1,
        )
        const { service } = setup({ rows, env: 'production' })
        const catalog = await service.getCatalog()
        expect(catalog.map((method) => [method.code, method.currency])).toEqual([
            ['TRANSFERENCIA', 'VES'],
            ['ZELLE', 'USD'],
            ['BINANCE', 'USD'],
        ])
        const label = await service.labeler()
        expect(label('ZELLE')).toBe('Zelle')
        expect(label('PAGO_MOVIL')).toBe('Pago movil')
        expect(await service.sort(['BINANCE', 'PAGO_MOVIL', 'TRANSFERENCIA'])).toEqual([
            'TRANSFERENCIA',
            'BINANCE',
            'PAGO_MOVIL',
        ])
    })

    it('caches the catalog and reloads it after an edit or a reorder', async () => {
        const { service, methods } = setup()
        await service.getCatalog()
        await service.labeler()
        expect(methods.find).toHaveBeenCalledTimes(1)

        const catalog = await service.update('ZELLE', { label: 'Zelle (USD)', icon: 'wallet' })
        expect(methods.update).toHaveBeenCalledWith(
            { code: 'ZELLE' },
            { label: 'Zelle (USD)', icon: 'wallet' },
        )
        expect(catalog[2]).toMatchObject({ label: 'Zelle (USD)', icon: 'wallet' })
        expect((await service.labeler())('ZELLE')).toBe('Zelle (USD)')

        const reordered = await service.reorder(['BINANCE', 'ZELLE', 'TRANSFERENCIA', 'PAGO_MOVIL'])
        expect(reordered.map((method) => method.code)).toEqual([
            'BINANCE',
            'ZELLE',
            'TRANSFERENCIA',
            'PAGO_MOVIL',
        ])
        await expect(service.reorder(['ZELLE'])).rejects.toBeInstanceOf(BadRequestException)
    })

    it('refuses an unknown method or an edit with nothing to change', async () => {
        const { service, methods } = setup()
        await expect(service.update('PAYPAL', { label: 'X' })).rejects.toBeInstanceOf(
            NotFoundException,
        )
        await expect(service.update('ZELLE', {})).rejects.toBeInstanceOf(BadRequestException)
        expect(methods.update).not.toHaveBeenCalled()
    })
})
