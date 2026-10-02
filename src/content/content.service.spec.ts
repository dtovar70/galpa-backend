import { BadRequestException, NotFoundException } from '@nestjs/common'
import type { Repository } from 'typeorm'
import { Role } from '../auth/role.enum.js'
import type { BanksService } from '../catalogs/banks.service.js'
import {
    unavailablePrefixMessage,
    type MobilePrefixesService,
} from '../catalogs/mobile-prefixes.service.js'
import type { AuthUser } from '../common/types/auth-user.js'
import { DEFAULT_SITE_CONTENT } from './content.defaults.js'
import { ContentService, mergeSection } from './content.service.js'
import {
    configuredMethods,
    CONTENT_SECTIONS,
    isMethodConfigured,
    type ContentSection,
    type PaymentContent,
} from './content.types.js'
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
    /** The `banks` catalog: 0102 is active, 0104 exists but was deactivated. */
    const banks = {
        findActive: vi.fn((code: string) =>
            Promise.resolve(
                code === '0102'
                    ? { code, name: 'Banco de Venezuela', isActive: true, sortOrder: 0 }
                    : null,
            ),
        ),
    }
    /** The `mobile_prefixes` catalog: 0426 exists but is inactive. */
    const activePrefixes = ['0412', '0414', '0416', '0422', '0424']
    const mobilePrefixes = {
        phoneProblem: vi.fn((phone: string) =>
            Promise.resolve(
                activePrefixes.includes(phone.slice(0, 4))
                    ? null
                    : unavailablePrefixMessage(phone.slice(0, 4)),
            ),
        ),
    }
    const service = new ContentService(
        entries as unknown as Repository<SiteContentEntry>,
        banks as unknown as BanksService,
        mobilePrefixes as unknown as MobilePrefixesService,
    )
    return { service, entries, banks, mobilePrefixes }
}

/** A payment section with only Pago Móvil filled in. */
function pagoMovil(fields: Partial<PaymentContent['pagoMovil']> = {}): PaymentContent {
    return {
        ...structuredClone(DEFAULT_SITE_CONTENT.payment),
        pagoMovil: {
            enabled: true,
            bankCode: '0102',
            bankName: 'Banco de Venezuela',
            phone: '0412-5550134',
            idNumber: 'J-123456789',
            holderName: 'Corporación Galpa 2022 C.A.',
            ...fields,
        },
    }
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

    it('merges the nested payment methods field by field', () => {
        const merged = mergeSection('payment', {
            instructions: 'Hola',
            zelle: { enabled: true, email: 'pagos@galpa.com.ve' },
        })
        expect(merged.instructions).toBe('Hola')
        expect(merged.zelle).toEqual({ enabled: true, email: 'pagos@galpa.com.ve', holderName: '' })
        expect(merged.pagoMovil).toEqual(DEFAULT_SITE_CONTENT.payment.pagoMovil)
    })

    it('gives a home row saved before testimonials existed an empty list', () => {
        const { testimonials: _testimonials, ...stored } = {
            ...DEFAULT_SITE_CONTENT.home,
            heroBadge: 'Desde 1996',
        }
        const merged = mergeSection('home', stored)
        expect(merged.testimonials).toEqual([])
        expect(merged.heroBadge).toBe('Desde 1996')
    })
})

describe('ContentService', () => {
    it('getAll merges the stored sections over the defaults', async () => {
        // A row of a retired section (e.g. left by an older version) is ignored, not returned.
        const { service } = setup([
            { key: 'about', value: { paragraphs: ['Solo hoy'] } },
            { key: 'retired' as ContentSection, value: { messages: ['Viejo'] } },
        ])
        const content = await service.getAll()
        expect(Object.keys(content)).toEqual([...CONTENT_SECTIONS])
        expect(content.about.paragraphs).toEqual(['Solo hoy'])
        expect(content.home).toEqual(DEFAULT_SITE_CONTENT.home)
    })

    it('rejects unknown sections with 404', async () => {
        const { service } = setup()
        await expect(service.update('banner', {}, USER)).rejects.toThrow(NotFoundException)
        await expect(service.reset('banner')).rejects.toThrow(NotFoundException)
    })

    it('every default section passes its own DTO (payment methods start disabled)', async () => {
        const { service } = setup()
        for (const section of CONTENT_SECTIONS) {
            await expect(
                service.update(section, structuredClone(DEFAULT_SITE_CONTENT[section]), USER),
            ).resolves.toMatchObject({ section })
        }
        expect(configuredMethods(DEFAULT_SITE_CONTENT.payment)).toEqual([])
    })

    it('stores the trimmed section as JSON with the author', async () => {
        const { service, entries } = setup()
        await service.update(
            'shipping',
            { ...DEFAULT_SITE_CONTENT.shipping, dispatchCopy: '  Despachamos en 24 horas  ' },
            USER,
        )
        const [sql, params] = entries.query.mock.calls[0] as [string, unknown[]]
        expect(sql).toContain('ON CONFLICT ("key") DO UPDATE')
        expect(params[0]).toBe('shipping')
        expect(JSON.parse(params[1] as string)).toEqual({
            ...DEFAULT_SITE_CONTENT.shipping,
            dispatchCopy: 'Despachamos en 24 horas',
        })
        expect(params[2]).toBe(USER.id)
    })

    it('validates formats, money and required fields in Spanish', async () => {
        const { service } = setup()
        const details = await detailsOf(
            service.update(
                'payment',
                pagoMovil({
                    bankCode: '102',
                    phone: '0212-1234567',
                    idNumber: 'V12345678',
                    holderName: '',
                }),
                USER,
            ),
        )
        expect(details).toEqual([
            {
                field: 'pagoMovil.bankCode',
                errors: ['El código del banco debe tener el formato 0102 (4 dígitos).'],
            },
            {
                field: 'pagoMovil.phone',
                errors: ['El teléfono de Pago Móvil debe tener el formato 0412-5550134.'],
            },
            {
                field: 'pagoMovil.idNumber',
                errors: ['Usa V, J o G seguido de 6 a 9 números, por ejemplo V-12345678.'],
            },
            { field: 'pagoMovil.holderName', errors: ['El titular es obligatorio.'] },
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
        await expect(service.update('payment', pagoMovil(), USER)).resolves.toBeDefined()
        await expect(
            service.update('payment', pagoMovil({ idNumber: 'V-12345678' }), USER),
        ).resolves.toBeDefined()
    })

    it('accepts only V, J or G followed by 6 to 9 digits', async () => {
        const { service } = setup()
        for (const idNumber of [
            'E-12345678',
            'P-1234567',
            'V-12345',
            'V-1234567890',
            'v-1234567',
        ]) {
            expect(
                await detailsOf(service.update('payment', pagoMovil({ idNumber }), USER)),
            ).toEqual([
                {
                    field: 'pagoMovil.idNumber',
                    errors: ['Usa V, J o G seguido de 6 a 9 números, por ejemplo V-12345678.'],
                },
            ])
        }
        for (const idNumber of ['V-123456', 'G-20000001', 'J-123456789']) {
            await expect(
                service.update('payment', pagoMovil({ idNumber }), USER),
            ).resolves.toBeDefined()
        }
    })

    it('requires the details of an enabled method and checks filled ones of a disabled one', async () => {
        const { service } = setup()
        const payment = structuredClone(DEFAULT_SITE_CONTENT.payment)
        payment.zelle = { enabled: true, email: '', holderName: '' }
        payment.binance = { enabled: false, payId: 'no valido!', email: '', holderName: '' }
        payment.transfer = { ...payment.transfer, enabled: true, accountNumber: '0102123' }
        const fields = (await detailsOf(service.update('payment', payment, USER))).map(
            (detail) => detail.field,
        )
        expect(fields).toEqual([
            'transfer.bankCode',
            'transfer.accountNumber',
            'transfer.idNumber',
            'transfer.holderName',
            'zelle.email',
            'zelle.holderName',
            'binance.payId',
        ])
    })

    it('stores a full multi-method section; only complete enabled methods are offered', async () => {
        const { service, entries } = setup()
        const payment: PaymentContent = {
            ...pagoMovil(),
            transfer: {
                enabled: true,
                bankCode: '0102',
                bankName: '',
                accountNumber: '01020123450000012345',
                accountType: 'AHORRO',
                idNumber: 'J-123456789',
                holderName: 'Corporación Galpa 2022 C.A.',
            },
            zelle: { enabled: true, email: 'pagos@galpa.com.ve', holderName: 'Galpa LLC' },
            binance: { enabled: false, payId: '123456789', email: '', holderName: '' },
        }
        await service.update('payment', payment, USER)
        const [, params] = entries.query.mock.calls[0] as [string, unknown[]]
        const stored = JSON.parse(params[1] as string) as PaymentContent
        expect(stored.transfer.bankName).toBe('Banco de Venezuela')
        expect(configuredMethods(stored)).toEqual(['PAGO_MOVIL', 'TRANSFERENCIA', 'ZELLE'])
        expect(isMethodConfigured(stored, 'BINANCE')).toBe(false)
        expect(
            isMethodConfigured({ ...stored, zelle: { ...stored.zelle, email: ' ' } }, 'ZELLE'),
        ).toBe(false)
    })

    it('refuses a Pago Móvil phone or a WhatsApp on an inactive operator code', async () => {
        const { service, entries } = setup()
        expect(
            await detailsOf(
                service.update(
                    'payment',
                    pagoMovil({ bankCode: '0104', phone: '0426-1234567' }),
                    USER,
                ),
            ),
        ).toEqual([
            { field: 'pagoMovil.bankCode', errors: ['Elige un banco de la lista.'] },
            { field: 'pagoMovil.phone', errors: ['El código 0426 no está disponible.'] },
        ])
        expect(
            await detailsOf(
                service.update(
                    'contact',
                    { ...DEFAULT_SITE_CONTENT.contact, whatsapp: '0426-1234567' },
                    USER,
                ),
            ),
        ).toEqual([{ field: 'whatsapp', errors: ['El código 0426 no está disponible.'] }])
        // The contact phone also takes landlines and is not checked against the catalog.
        await expect(
            service.update(
                'contact',
                { ...DEFAULT_SITE_CONTENT.contact, phone: '0426-1234567' },
                USER,
            ),
        ).resolves.toBeDefined()
        expect(entries.query).toHaveBeenCalledTimes(1)
    })

    it('takes the Pago Móvil bank from the active banks of the catalog', async () => {
        const { service, entries, banks } = setup()
        await service.update('payment', pagoMovil({ bankName: 'Otro nombre' }), USER)
        const [, params] = entries.query.mock.calls[0] as [string, unknown[]]
        expect((JSON.parse(params[1] as string) as PaymentContent).pagoMovil).toMatchObject({
            bankCode: '0102',
            bankName: 'Banco de Venezuela',
        })

        entries.query.mockClear()
        expect(
            await detailsOf(service.update('payment', pagoMovil({ bankCode: '0104' }), USER)),
        ).toEqual([{ field: 'pagoMovil.bankCode', errors: ['Elige un banco de la lista.'] }])
        expect(banks.findActive).toHaveBeenLastCalledWith('0104')
        expect(entries.query).not.toHaveBeenCalled()
    })

    it('checks list sizes and names the offending item', async () => {
        const { service } = setup()
        const about = (paragraphs: string[]) => ({ ...DEFAULT_SITE_CONTENT.about, paragraphs })
        expect(await detailsOf(service.update('about', about([]), USER))).toEqual([
            {
                field: 'paragraphs',
                errors: ['La lista de párrafos debe tener al menos 1 elemento.'],
            },
        ])
        expect(await detailsOf(service.update('about', about(['Hola', '   ', 'x']), USER))).toEqual(
            [{ field: 'paragraphs', errors: ['El párrafo 2 es obligatorio.'] }],
        )
        const seven = Array.from({ length: 7 }, (_, index) => `Párrafo ${index}`)
        expect(await detailsOf(service.update('about', about(seven), USER))).toEqual([
            {
                field: 'paragraphs',
                errors: ['La lista de párrafos admite como máximo 6 elementos.'],
            },
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

    it('ships no testimonials and stores trimmed ones with optional city and product', async () => {
        expect(DEFAULT_SITE_CONTENT.home.testimonials).toEqual([])
        const { service, entries } = setup()
        await service.update(
            'home',
            {
                ...DEFAULT_SITE_CONTENT.home,
                testimonials: [
                    { quote: '  Excelente asesoría  ', name: 'Ana', city: 'Valencia', product: '' },
                    { quote: 'Llegó rapidísimo', name: ' Luis ', city: '', product: 'Split 12k' },
                ],
            },
            USER,
        )
        const [, params] = entries.query.mock.calls[0] as [string, unknown[]]
        expect((JSON.parse(params[1] as string) as { testimonials: unknown }).testimonials).toEqual(
            [
                { quote: 'Excelente asesoría', name: 'Ana', city: 'Valencia', product: '' },
                { quote: 'Llegó rapidísimo', name: 'Luis', city: '', product: 'Split 12k' },
            ],
        )
    })

    it('validates each testimonial and the size of the list', async () => {
        const { service } = setup()
        const home = structuredClone(DEFAULT_SITE_CONTENT.home)
        home.testimonials = [
            { quote: '   ', name: 'x'.repeat(61), city: '', product: 'y'.repeat(81) },
        ]
        expect(await detailsOf(service.update('home', home, USER))).toEqual([
            { field: 'testimonials.0.quote', errors: ['La opinión del cliente es obligatoria.'] },
            {
                field: 'testimonials.0.name',
                errors: ['El nombre del cliente no puede superar los 60 caracteres.'],
            },
            {
                field: 'testimonials.0.product',
                errors: ['El producto de la reseña no puede superar los 80 caracteres.'],
            },
        ])

        home.testimonials = [{ quote: 'z'.repeat(401), name: 'Ana', city: '', product: '' }]
        expect(await detailsOf(service.update('home', home, USER))).toEqual([
            {
                field: 'testimonials.0.quote',
                errors: ['La opinión del cliente no puede superar los 400 caracteres.'],
            },
        ])

        home.testimonials = Array.from({ length: 13 }, (_, index) => ({
            quote: `Opinión ${index}`,
            name: 'Ana',
            city: '',
            product: '',
        }))
        expect(await detailsOf(service.update('home', home, USER))).toEqual([
            {
                field: 'testimonials',
                errors: ['La lista de reseñas admite como máximo 12 elementos.'],
            },
        ])

        // Sections are replaced whole: optional fields must still be sent.
        home.testimonials = [{ quote: 'Bien', name: 'Ana' } as never]
        const missing = await detailsOf(service.update('home', home, USER))
        expect(missing.map(({ field, errors }) => [field, errors[0]])).toEqual([
            ['testimonials.0.city', 'La ciudad del cliente debe ser un texto.'],
            ['testimonials.0.product', 'El producto de la reseña debe ser un texto.'],
        ])
    })

    it('only accepts the placeholders and highlight marks each field supports', async () => {
        const { service } = setup()
        expect(
            await detailsOf(
                service.update(
                    'about',
                    { ...DEFAULT_SITE_CONTENT.about, paragraphs: ['Desde {envio}'] },
                    USER,
                ),
            ),
        ).toEqual([
            {
                field: 'paragraphs',
                errors: ['El párrafo 1 usa {envio}, que no existe. Puedes usar {marca}, {ciudad}.'],
            },
        ])

        const home = {
            ...DEFAULT_SITE_CONTENT.home,
            heroTitle: 'El clima *ideal para tu hogar',
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
                    instagram: '@galpa',
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
