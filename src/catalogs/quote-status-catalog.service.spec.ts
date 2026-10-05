import { BadRequestException, Logger, NotFoundException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { Repository } from 'typeorm'
import { quoteStatusRows } from '../../test/fixtures/catalogs.js'
import type { Env } from '../config/env.schema.js'
import type { QuoteStatusDefinition } from './entities/quote-status-definition.entity.js'
import { QuoteStatusCatalogService } from './quote-status-catalog.service.js'

function setup(options: { rows?: QuoteStatusDefinition[]; env?: Env['NODE_ENV'] } = {}) {
    const rows = options.rows ?? quoteStatusRows()
    const statuses = {
        find: vi.fn(() => Promise.resolve(rows)),
        existsBy: vi.fn(({ code }: { code: string }) =>
            Promise.resolve(rows.some((row) => row.code === code)),
        ),
        update: vi.fn(({ code }: { code: string }, changes: Partial<QuoteStatusDefinition>) => {
            Object.assign(rows.find((row) => row.code === code) ?? {}, changes)
            return Promise.resolve({ affected: 1 })
        }),
    }
    const config = { get: vi.fn(() => options.env ?? 'development') }
    const service = new QuoteStatusCatalogService(
        statuses as unknown as Repository<QuoteStatusDefinition>,
        config as unknown as ConfigService<Env, true>,
    )
    return { service, statuses }
}

describe('quote status catalog', () => {
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
        const rows = quoteStatusRows().filter((row) => row.code !== 'VENCIDA')
        rows.push({ ...rows[0]!, code: 'PERDIDA' })
        const { service } = setup({ rows })

        await expect(service.onApplicationBootstrap()).rejects.toThrow(
            'The quote status catalog does not match QUOTE_STATUSES (missing in quote_statuses: VENCIDA; unknown to the code (QUOTE_STATUSES): PERDIDA).',
        )
        expect(Logger.prototype.error).toHaveBeenCalledOnce()
    })

    it('only logs the mismatch in production', async () => {
        const { service } = setup({ rows: [], env: 'production' })
        await expect(service.onApplicationBootstrap()).resolves.toBeUndefined()
        expect(Logger.prototype.error).toHaveBeenCalledOnce()
    })

    it('sorts the statuses and labels them from the table, prettifying a missing row', async () => {
        const rows = quoteStatusRows().reverse()
        rows.splice(
            rows.findIndex((row) => row.code === 'CONVERTIDA'),
            1,
        )
        const { service } = setup({ rows, env: 'production' })
        const catalog = await service.getCatalog()
        expect(catalog.map((status) => status.code)).toEqual([
            'BORRADOR',
            'ENVIADA',
            'ACEPTADA',
            'RECHAZADA',
            'VENCIDA',
        ])
        expect(catalog[2]).toEqual({
            code: 'ACEPTADA',
            label: 'Aceptada',
            description: 'Qué significa «Aceptada».',
            tone: 'brand',
            sortOrder: 2,
            isTerminal: false,
        })
        const label = await service.labeler()
        expect(label('ENVIADA')).toBe('Enviada')
        expect(label('CONVERTIDA')).toBe('Convertida')
    })

    it('caches the catalog and reloads it after an admin edit', async () => {
        const { service, statuses } = setup()
        await service.getCatalog()
        await service.labeler()
        expect(statuses.find).toHaveBeenCalledTimes(1)

        const catalog = await service.updateStatus('ENVIADA', {
            label: 'Enviada al cliente',
            tone: 'outline',
        })
        expect(statuses.update).toHaveBeenCalledWith(
            { code: 'ENVIADA' },
            { label: 'Enviada al cliente', tone: 'outline' },
        )
        expect(statuses.find).toHaveBeenCalledTimes(2)
        expect(catalog[1]).toMatchObject({ label: 'Enviada al cliente', tone: 'outline' })
        expect((await service.labeler())('ENVIADA')).toBe('Enviada al cliente')
    })

    it('refuses an unknown status or an edit with nothing to change', async () => {
        const { service, statuses } = setup()
        await expect(service.updateStatus('PERDIDA', { label: 'X' })).rejects.toBeInstanceOf(
            NotFoundException,
        )
        await expect(service.updateStatus('ENVIADA', {})).rejects.toBeInstanceOf(
            BadRequestException,
        )
        expect(statuses.update).not.toHaveBeenCalled()
    })
})
