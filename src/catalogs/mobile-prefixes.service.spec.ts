import { ConflictException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import type { MobilePrefix } from './entities/mobile-prefix.entity.js'
import { MobilePrefixesService, mobilePrefixInUseMessage } from './mobile-prefixes.service.js'

function setup() {
    const rows: MobilePrefix[] = [
        { code: '0424', isActive: true, sortOrder: 1 },
        { code: '0412', isActive: true, sortOrder: 0 },
        { code: '0426', isActive: false, sortOrder: 2 },
    ]
    const repository = {
        find: vi.fn(() => Promise.resolve(rows.map((row) => ({ ...row })))),
        existsBy: vi.fn(({ code }: { code: string }) =>
            Promise.resolve(rows.some((row) => row.code === code)),
        ),
        findOneBy: vi.fn(({ code }: { code: string }) =>
            Promise.resolve(rows.find((row) => row.code === code) ?? null),
        ),
        update: vi.fn(({ code }: { code: string }, changes: Partial<MobilePrefix>) => {
            Object.assign(rows.find((row) => row.code === code) ?? {}, changes)
            return Promise.resolve({})
        }),
        delete: vi.fn(() => Promise.resolve({ affected: 1 })),
        query: vi.fn((sql: string) =>
            Promise.resolve(
                sql.includes('"site_content"')
                    ? [{ key: 'payment', value: { pagoMovil: { phone: '0424-1234567' } } }]
                    : [{ code: '0412', count: '2' }],
            ),
        ),
    }
    const service = new MobilePrefixesService(repository as unknown as Repository<MobilePrefix>)
    return { service, repository }
}

describe('mobilePrefixInUseMessage', () => {
    it('explains every reason, or returns null when nothing uses the code', () => {
        expect(mobilePrefixInUseMessage('0424', { activeOrderCount: 0, contentFields: [] })).toBe(
            null,
        )
        expect(
            mobilePrefixInUseMessage('0424', {
                activeOrderCount: 1,
                contentFields: ['payment.phone', 'contact.whatsapp'],
            }),
        ).toBe(
            'No puedes eliminar el código 0424 porque lo usa 1 pedido en curso, es el teléfono de tu Pago Móvil y es el WhatsApp de contacto. Desactívalo para ocultarlo.',
        )
    })
})

describe('MobilePrefixesService', () => {
    it('lists the active codes in order and caches them', async () => {
        const { service, repository } = setup()
        expect(await service.listActive()).toEqual([{ code: '0412' }, { code: '0424' }])
        expect(await service.phoneProblem('0424-1234567')).toBeNull()
        expect(await service.phoneProblem('0426-1234567')).toBe(
            'El código 0426 no está disponible.',
        )
        expect(await service.phoneProblem('0416-1234567')).toBe(
            'El código 0416 no está disponible.',
        )
        expect(repository.find).toHaveBeenCalledTimes(1)
    })

    it('drops the cache after an edit, so a deactivated code is refused at once', async () => {
        const { service } = setup()
        expect(await service.phoneProblem('0424-1234567')).toBeNull()
        await service.update('0424', { isActive: false })
        expect(await service.phoneProblem('0424-1234567')).toBe(
            'El código 0424 no está disponible.',
        )
    })

    it('reports what uses each code and refuses to delete a code in use', async () => {
        const { service, repository } = setup()
        const list = await service.listForAdmin()
        expect(list.map((row) => [row.code, row.activeOrderCount, row.contentFields])).toEqual([
            ['0412', 2, []],
            // The default contact WhatsApp is 0414-…, so only the stored Pago Móvil phone counts.
            ['0424', 0, ['payment.phone']],
            ['0426', 0, []],
        ])
        await expect(service.remove('0412')).rejects.toThrow(ConflictException)
        await expect(service.remove('0424')).rejects.toThrow(
            'No puedes eliminar el código 0424 porque es el teléfono de tu Pago Móvil. Desactívalo para ocultarlo.',
        )
        await service.remove('0426')
        expect(repository.delete).toHaveBeenCalledExactlyOnceWith({ code: '0426' })
    })
})
