import { BadRequestException, NotFoundException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { Role } from '../auth/role.enum.js'
import type { AuthUser } from '../common/types/auth-user.js'
import { DEFAULT_SITE_CONTENT } from './content.defaults.js'
import { ContentService, mergeSection } from './content.service.js'
import { CONTENT_SECTIONS } from './content.types.js'
import type { SiteContentEntry } from './entities/site-content.entity.js'

const USER: AuthUser = {
    id: 'user-1',
    email: 'admin@example.com',
    name: 'Admin',
    role: Role.ADMIN,
    createdAt: new Date(),
    updatedAt: new Date(),
}

function setup(rows: Partial<SiteContentEntry>[] = []) {
    const entries = {
        find: vi.fn().mockResolvedValue(rows),
        findOne: vi.fn().mockResolvedValue(null),
        query: vi.fn().mockResolvedValue([]),
        delete: vi.fn().mockResolvedValue({ affected: 1 }),
    }
    const service = new ContentService(entries as unknown as Repository<SiteContentEntry>)
    return { service, entries }
}

/** The validation error details of a rejected update. */
async function detailsOf(
    promise: Promise<unknown>,
): Promise<{ field: string; errors: string[] }[]> {
    const error = await promise.then(
        () => null,
        (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(BadRequestException)
    return ((error as BadRequestException).getResponse() as { details: never[] }).details
}

describe('mergeSection', () => {
    it('returns a copy of the defaults when nothing is stored', () => {
        const merged = mergeSection('shipping', undefined)
        expect(merged).toEqual(DEFAULT_SITE_CONTENT.shipping)
        expect(merged).not.toBe(DEFAULT_SITE_CONTENT.shipping)
    })

    it('keeps stored fields, fills the missing ones and drops unknown or mistyped ones', () => {
        const merged = mergeSection('shipping', {
            flatRate: 6,
            freeThreshold: '50',
            legacyField: 'x',
        })
        expect(merged).toEqual({ ...DEFAULT_SITE_CONTENT.shipping, flatRate: 6 })
    })
})

describe('ContentService', () => {
    it('getAll merges the stored sections over the defaults', async () => {
        const { service } = setup([{ key: 'announcements', value: { messages: ['Solo hoy'] } }])
        const content = await service.getAll()
        expect(Object.keys(content)).toEqual([...CONTENT_SECTIONS])
        expect(content.announcements.messages).toEqual(['Solo hoy'])
        expect(content.home).toEqual(DEFAULT_SITE_CONTENT.home)
    })

    it('rejects unknown sections with 404', async () => {
        const { service } = setup()
        await expect(service.update('banner', {}, USER)).rejects.toThrow(NotFoundException)
        await expect(service.reset('banner')).rejects.toThrow(NotFoundException)
    })

    it('every default section except Pago Móvil (empty until filled) passes its own DTO', async () => {
        const { service } = setup()
        for (const section of CONTENT_SECTIONS) {
            const save = service.update(
                section,
                structuredClone(DEFAULT_SITE_CONTENT[section]),
                USER,
            )
            if (section === 'payment') await expect(save).rejects.toThrow(BadRequestException)
            else await expect(save).resolves.toMatchObject({ section })
        }
    })

    it('stores the trimmed section as JSON with the author', async () => {
        const { service, entries } = setup()
        await service.update(
            'shipping',
            { ...DEFAULT_SITE_CONTENT.shipping, productionCopy: '  Listo en 2 días  ' },
            USER,
        )
        const [sql, params] = entries.query.mock.calls[0] as [string, unknown[]]
        expect(sql).toContain('ON CONFLICT ("key") DO UPDATE')
        expect(params[0]).toBe('shipping')
        expect(JSON.parse(params[1] as string)).toEqual({
            ...DEFAULT_SITE_CONTENT.shipping,
            productionCopy: 'Listo en 2 días',
        })
        expect(params[2]).toBe(USER.id)
    })

    it('validates formats, money and required fields in Spanish', async () => {
        const { service } = setup()
        const details = await detailsOf(
            service.update(
                'payment',
                {
                    bankCode: '102',
                    bankName: 'Banco de Venezuela',
                    phone: '0212-1234567',
                    idNumber: 'V12345678',
                    holderName: '',
                    instructions: '',
                },
                USER,
            ),
        )
        expect(details).toEqual([
            {
                field: 'bankCode',
                errors: ['El código del banco debe tener el formato 0102 (4 dígitos).'],
            },
            {
                field: 'phone',
                errors: ['El teléfono de Pago Móvil debe tener el formato 0412-5550134.'],
            },
            {
                field: 'idNumber',
                errors: ['La cédula o RIF debe tener el formato V-12345678 o J-123456789.'],
            },
            { field: 'holderName', errors: ['El titular es obligatorio.'] },
        ])

        const shipping = await detailsOf(
            service.update(
                'shipping',
                { ...DEFAULT_SITE_CONTENT.shipping, flatRate: -1, freeThreshold: 1.234 },
                USER,
            ),
        )
        expect(shipping).toEqual([
            {
                field: 'freeThreshold',
                errors: ['El monto para envío gratis debe ser un número con hasta 2 decimales.'],
            },
            { field: 'flatRate', errors: ['La tarifa de envío no puede ser negativa.'] },
        ])
    })

    it('accepts cédulas and RIFs', async () => {
        const { service } = setup()
        const payment = {
            bankCode: '0102',
            bankName: 'Banco de Venezuela',
            phone: '0412-5550134',
            idNumber: 'J-123456789',
            holderName: 'Manada Russo C.A.',
            instructions: '',
        }
        await expect(service.update('payment', payment, USER)).resolves.toBeDefined()
        await expect(
            service.update('payment', { ...payment, idNumber: 'V-12345678' }, USER),
        ).resolves.toBeDefined()
    })

    it('checks list sizes and names the offending item', async () => {
        const { service } = setup()
        expect(await detailsOf(service.update('announcements', { messages: [] }, USER))).toEqual([
            {
                field: 'messages',
                errors: ['La lista de anuncios debe tener al menos 1 elemento.'],
            },
        ])
        expect(
            await detailsOf(
                service.update('announcements', { messages: ['Hola', '   ', 'x'] }, USER),
            ),
        ).toEqual([{ field: 'messages', errors: ['El anuncio 2 es obligatorio.'] }])
        const nine = Array.from({ length: 9 }, (_, index) => `Anuncio ${index}`)
        expect(await detailsOf(service.update('announcements', { messages: nine }, USER))).toEqual([
            { field: 'messages', errors: ['La lista de anuncios admite como máximo 8 elementos.'] },
        ])
    })

    it('reports nested list fields by path', async () => {
        const { service } = setup()
        const home = structuredClone(DEFAULT_SITE_CONTENT.home)
        home.steps[1] = { title: '', description: 'Algo' }
        expect(await detailsOf(service.update('home', home, USER))).toEqual([
            { field: 'steps.1.title', errors: ['El título del paso es obligatorio.'] },
        ])
    })

    it('only accepts the placeholders and highlight marks each field supports', async () => {
        const { service } = setup()
        expect(
            await detailsOf(
                service.update('announcements', { messages: ['Gratis desde {envio}'] }, USER),
            ),
        ).toEqual([
            {
                field: 'messages',
                errors: [
                    'El anuncio 1 usa {envio}, que no existe. Puedes usar {envioGratis}, {tarifaEnvio}.',
                ],
            },
        ])

        const home = {
            ...DEFAULT_SITE_CONTENT.home,
            heroTitle: 'Tazas *que hablan por ti',
            heroBadge: 'Hola {marca}',
        }
        expect(await detailsOf(service.update('home', home, USER))).toEqual([
            {
                field: 'heroBadge',
                errors: ['La etiqueta de la portada no admite marcadores como {marca}.'],
            },
            {
                field: 'heroTitle',
                errors: [
                    'El titular de la portada tiene un destacado sin cerrar o vacío. Marca las palabras destacadas así: *palabras*.',
                ],
            },
        ])
    })

    it('rejects unknown fields and unknown About icons', async () => {
        const { service } = setup()
        expect(
            await detailsOf(
                service.update('general', { ...DEFAULT_SITE_CONTENT.general, logo: 'x' }, USER),
            ),
        ).toEqual([{ field: 'logo', errors: ['El campo "logo" no está permitido.'] }])

        const about = structuredClone(DEFAULT_SITE_CONTENT.about)
        ;(about.values[0] as { icon: string }).icon = 'rocket'
        expect(await detailsOf(service.update('about', about, USER))).toEqual([
            { field: 'values.0.icon', errors: ['El ícono del valor no es válido.'] },
        ])
    })

    it('validates the contact handles, phone and email', async () => {
        const { service } = setup()
        const details = await detailsOf(
            service.update(
                'contact',
                {
                    ...DEFAULT_SITE_CONTENT.contact,
                    phone: '+58 412 555 0134',
                    instagram: '@manada',
                },
                USER,
            ),
        )
        expect(details.map((detail) => detail.field)).toEqual(['phone', 'instagram'])
        await expect(
            service.update(
                'contact',
                { ...DEFAULT_SITE_CONTENT.contact, phone: '0253-1234567', tiktok: '' },
                USER,
            ),
        ).resolves.toBeDefined()
    })

    it('reset deletes the stored row and returns the defaults', async () => {
        const { service, entries } = setup()
        const section = await service.reset('about')
        expect(entries.delete).toHaveBeenCalledWith({ key: 'about' })
        expect(section).toEqual({
            section: 'about',
            value: DEFAULT_SITE_CONTENT.about,
            isDefault: true,
            updatedAt: null,
            updatedBy: null,
        })
    })
})
