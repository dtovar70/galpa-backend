import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { CategoryDesignTemplate } from '../src/categories/entities/category-design-template.entity.js'
import { Category } from '../src/categories/entities/category.entity.js'
import { createValidationPipe } from '../src/common/pipes/validation.pipe.js'
import { Design } from '../src/designs/entities/design.entity.js'
import { Product } from '../src/products/entities/product.entity.js'
import { STORAGE_SERVICE, type StorageService } from '../src/storage/storage.service.js'
import { artworkPng, attachDesign, imageLayer, jpeg, MUG_PRINT, png } from './fixtures/designs.js'
import { FakeDb, USERS, type Row } from './fixtures/fake-orders-db.js'

const AREA = { x: 0.2, y: 0.3, width: 0.6, height: 0.4 }

describe('Category design templates (e2e)', () => {
    let app: INestApplication
    let db: FakeDb
    let cookie: (user: keyof typeof USERS) => string
    let stored = 0
    const storage = {
        driver: 'local' as const,
        upload: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined),
        uploadPrivate: vi.fn(),
        readPrivate: vi.fn(),
        deletePrivate: vi.fn().mockResolvedValue(undefined),
    }

    const http = () => request(app.getHttpServer())
    const category = (slug: string) => db.table(Category).find((row) => row.slug === slug) as Row

    const colors = (slug: string) =>
        db.table(CategoryDesignTemplate).filter((row) => row.categorySlug === slug)

    const addColor = (
        slug: string,
        fields: { colorName?: string; colorHex?: string } = {
            colorName: 'Blanco',
            colorHex: '#ffffff',
        },
        file: Buffer | null = jpeg(1200, 900),
        contentType = 'image/jpeg',
        user: keyof typeof USERS | null = 'admin',
    ) => {
        const req = http().post(`/api/admin/categories/${slug}/design-template/colors`)
        if (user) req.set('Cookie', cookie(user))
        if (fields.colorName !== undefined) req.field('colorName', fields.colorName)
        if (fields.colorHex !== undefined) req.field('colorHex', fields.colorHex)
        if (file) req.attach('file', file, { filename: 'plantilla.jpg', contentType })
        return req
    }

    /** Adds a color and returns its id. */
    const colorId = async (slug: string, colorName: string, colorHex = '#1F2937') => {
        const { body } = await addColor(slug, { colorName, colorHex }).expect(201)
        return (body.designTemplateSettings.colors as Row[]).find(
            (color) => color.name === colorName,
        )!.id as string
    }

    const colorPath = (slug: string, id: string, suffix = '') =>
        `/api/admin/categories/${slug}/design-template/colors/${id}${suffix}`

    const updateColor = (slug: string, id: string, body: Row) =>
        http().patch(colorPath(slug, id)).set('Cookie', cookie('admin')).send(body)

    const updateTemplate = (slug: string, body: Row) =>
        http()
            .patch(`/api/admin/categories/${slug}/design-template`)
            .set('Cookie', cookie('admin'))
            .send(body)

    /** `print`: the print area the editor would render the arte final for. */
    const uploadDesign = (
        productId: string,
        variantId?: string,
        templateColorId?: string,
        print = MUG_PRINT,
    ) =>
        attachDesign(http().post('/api/designs'), {
            fields: { productId, variantId, templateColorId, layers: [imageLayer(0)] },
            originals: [{ buffer: jpeg(2362, 1004) }],
            artwork: artworkPng(print),
            preview: png(800, 600),
        })

    const publicCategory = async (slug: string) => {
        const { body } = await http().get('/api/categories').expect(200)
        return (body as Row[]).find((row) => row.slug === slug)
    }

    beforeEach(async () => {
        db = new FakeDb()
        stored = 0
        vi.clearAllMocks()
        storage.upload.mockImplementation((_image: unknown, folder: string) => {
            stored += 1
            return Promise.resolve({
                url: `https://res.cloudinary.com/demo/image/upload/${folder}/t${stored}.jpg`,
                publicId: `manada-russo/${folder}/t${stored}`,
            })
        })
        storage.uploadPrivate.mockImplementation((_image: unknown, folder: string) =>
            Promise.resolve({ key: `${folder}/file-${++stored}.png` }),
        )
        // A photo-only category: a personalizable cooler.
        db.table(Product).push({
            id: 'cool-001',
            slug: 'cooler',
            name: 'Cooler',
            price: 10,
            stock: 5,
            isActive: true,
            categorySlug: 'coolers',
            tags: ['personalizable'],
        })

        const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(getDataSourceToken())
            .useValue(db.dataSource)
            .overrideProvider(STORAGE_SERVICE)
            .useValue(storage as unknown as StorageService)
            .compile()
        app = moduleFixture.createNestApplication()
        app.setGlobalPrefix('api')
        app.use(cookieParser())
        app.useGlobalPipes(createValidationPipe())
        await app.init()

        const signer = new JwtService({ secret: app.get(ConfigService).get<string>('JWT_SECRET') })
        cookie = (user) =>
            `mr_session=${signer.sign({ sub: USERS[user].id, role: USERS[user].role }, { expiresIn: 600 })}`
    })

    afterEach(async () => {
        await app.close()
    })

    it('exposes the design fields in the public list (illustration templates only, at first)', async () => {
        expect(await publicCategory('mugs')).toMatchObject({
            designEnabled: true,
            designTemplate: null,
            designPrintSize: { widthCm: 20, heightCm: 8.5 },
        })
        expect(await publicCategory('coolers')).toMatchObject({
            designEnabled: false,
            designTemplate: null,
            designPrintSize: null,
        })
    })

    it('adds a garment color with its photo and a default area in the print proportion', async () => {
        const { body } = await addColor('mugs').expect(201)
        expect(storage.upload).toHaveBeenCalledTimes(1)
        expect(storage.upload.mock.calls[0]?.[0]).toMatchObject({ type: 'jpeg' })
        expect(storage.upload.mock.calls[0]?.[1]).toBe('design-templates')

        // 1200 × 900 photo, 20 × 8.5 cm print: 600 px wide (half the photo), 255 px tall.
        const white = {
            name: 'Blanco',
            hex: '#FFFFFF',
            imageUrl: 'https://res.cloudinary.com/demo/image/upload/design-templates/t1.jpg',
            width: 1200,
            height: 900,
            printArea: { x: 0.25, y: 0.3584, width: 0.5, height: 0.2833 },
        }
        expect(body.designTemplateSettings).toEqual({
            colors: [{ id: expect.any(String), ...white }],
            maxColors: 6,
            printWidthCm: 20,
            printHeightCm: 8.5,
            hasIllustration: true,
            designDisabled: false,
        })
        expect(body.designTemplate).toEqual({
            printWidthCm: 20,
            printHeightCm: 8.5,
            colors: [{ id: expect.any(String), ...white }],
        })
        expect(colors('mugs')[0]).toMatchObject({
            publicId: 'manada-russo/design-templates/t1',
            sortOrder: 0,
        })
        // Two personalizable mugs (one hidden).
        expect(body.personalizableProductCount).toBe(2)

        // A second color starts with the first one's area (same framing) and goes last.
        await updateColor('mugs', body.designTemplateSettings.colors[0].id as string, {
            printArea: AREA,
        }).expect(200)
        const black = await addColor(
            'mugs',
            { colorName: '  Negro  ', colorHex: '#1f2937' },
            jpeg(800, 1000),
        ).expect(201)
        expect(black.body.designTemplateSettings.colors[1]).toMatchObject({
            name: 'Negro',
            hex: '#1F2937',
            width: 800,
            height: 1000,
            printArea: AREA,
        })
        expect(
            ((await publicCategory('mugs'))!.designTemplate as { colors: Row[] }).colors.map(
                (color) => color.name,
            ),
        ).toEqual(['Blanco', 'Negro'])
    })

    it('validates the photo by its bytes, size and weight, and only for the back office', async () => {
        const gif = await addColor('mugs', undefined, Buffer.from('GIF89a-not-really')).expect(400)
        expect(gif.body.message).toBe('La foto de la plantilla debe ser JPG, PNG o WEBP.')
        expect(gif.body.details).toEqual([
            { field: 'file', errors: ['La foto de la plantilla debe ser JPG, PNG o WEBP.'] },
        ])
        const svg = await addColor('mugs', undefined, jpeg(1200, 900), 'image/svg+xml').expect(400)
        expect(svg.body.message).toBe('La foto de la plantilla debe ser JPG, PNG o WEBP.')

        const small = await addColor('mugs', undefined, jpeg(1200, 599)).expect(400)
        expect(small.body.message).toBe(
            'La foto de la plantilla debe medir al menos 600 px en su lado más corto.',
        )

        const huge = await addColor('mugs', undefined, jpeg(12_001, 9000)).expect(400)
        expect(huge.body.message).toBe(
            'La foto de la plantilla es demasiado grande: puede medir como máximo 12.000 × 12.000 px (80 megapíxeles).',
        )

        const big = Buffer.concat([jpeg(1200, 900), Buffer.alloc(10 * 1024 * 1024)])
        const tooLarge = await addColor('mugs', undefined, big).expect(413)
        expect(tooLarge.body.message).toBe('La foto de la plantilla puede pesar como máximo 10 MB.')

        const missing = await addColor('mugs', undefined, null).expect(400)
        expect(missing.body.message).toBe('Adjunta la foto de la plantilla.')

        await addColor('nope').expect(404)
        await addColor('mugs', undefined, jpeg(1200, 900), 'image/jpeg', null).expect(401)
        // Like deleting a category, the template is for admins only.
        await addColor('mugs', undefined, jpeg(1200, 900), 'image/jpeg', 'editor').expect(403)
        await http()
            .patch('/api/admin/categories/mugs/design-template')
            .set('Cookie', cookie('editor'))
            .send({ printWidthCm: 10, printHeightCm: 5 })
            .expect(403)

        const id = await colorId('mugs', 'Blanco', '#FFFFFF')
        const editor = cookie('editor')
        await http()
            .patch(colorPath('mugs', id))
            .set('Cookie', editor)
            .send({ colorName: 'Crema' })
            .expect(403)
        await http()
            .post(colorPath('mugs', id, '/photo'))
            .set('Cookie', editor)
            .expect(403)
        await http().delete(colorPath('mugs', id)).set('Cookie', editor).expect(403)
        await http()
            .patch('/api/admin/categories/mugs/design-template/colors/order')
            .set('Cookie', editor)
            .send({ colorIds: [id] })
            .expect(403)
        expect(storage.upload).toHaveBeenCalledTimes(1)
    })

    it('validates the color name and swatch, unique per category and at most 6', async () => {
        const noName = await addColor('mugs', { colorHex: '#FFFFFF' }).expect(400)
        expect(noName.body.details[0].field).toBe('colorName')
        expect(noName.body.details[0].errors).toContain('El nombre del color es obligatorio.')
        const badHex = await addColor('mugs', { colorName: 'Negro', colorHex: 'negro' }).expect(400)
        expect(badHex.body.details).toEqual([
            {
                field: 'colorHex',
                errors: [
                    'El color debe tener formato hexadecimal de 6 dígitos, por ejemplo #1F2937.',
                ],
            },
        ])
        const long = await addColor('mugs', { colorName: 'x'.repeat(41), colorHex: '#000000' })
        expect(long.status).toBe(400)
        expect(storage.upload).not.toHaveBeenCalled()

        const black = await colorId('mugs', 'Negro')
        const duplicate = await addColor('mugs', {
            colorName: 'NEGRO',
            colorHex: '#000000',
        }).expect(400)
        expect(duplicate.body.details).toEqual([
            {
                field: 'colorName',
                errors: ['Ya tienes un color llamado «NEGRO» en esta plantilla.'],
            },
        ])
        // The same name in another category is fine.
        await addColor('tees', { colorName: 'Negro', colorHex: '#000000' }).expect(201)

        const white = await colorId('mugs', 'Blanco', '#FFFFFF')
        const renamed = await updateColor('mugs', white, { colorName: 'negro' }).expect(400)
        expect(renamed.body.message).toBe('Ya tienes un color llamado «negro» en esta plantilla.')
        // Renaming a color to itself with another case is not a duplicate.
        await updateColor('mugs', black, { colorName: 'NEGRO', colorHex: '#111111' }).expect(200)

        for (const name of ['Rojo', 'Azul', 'Verde', 'Rosado']) await colorId('mugs', name)
        const seventh = await addColor('mugs', { colorName: 'Gris', colorHex: '#888888' }).expect(
            400,
        )
        expect(seventh.body.message).toBe(
            'Puedes ofrecer como máximo 6 colores por categoría. Quita uno para agregar otro.',
        )
        expect(colors('mugs')).toHaveLength(6)
    })

    it('validates the print area and the print size in Spanish', async () => {
        const id = await colorId('coolers', 'Blanco', '#FFFFFF')
        const outside = await updateColor('coolers', id, {
            printArea: { x: 0.5, y: 0.1, width: 0.6, height: 0.3 },
        }).expect(400)
        expect(outside.body.message).toBe('El área de impresión debe quedar dentro de la foto.')

        const tiny = await updateColor('coolers', id, {
            printArea: { ...AREA, width: 0.01 },
        }).expect(400)
        expect(tiny.body.details).toEqual([
            {
                field: 'printArea.width',
                errors: ['El ancho del área debe ser como mínimo 0,05.'],
            },
        ])
        const negative = await updateColor('coolers', id, {
            printArea: { ...AREA, x: -0.1 },
        }).expect(400)
        expect(negative.body.details[0].field).toBe('printArea.x')
        await updateColor('coolers', 'nope', { printArea: AREA }).expect(404)

        const huge = await updateTemplate('coolers', {
            printWidthCm: 120,
            printHeightCm: 0,
        }).expect(400)
        expect(huge.body.details).toEqual([
            {
                field: 'printWidthCm',
                errors: ['El ancho de impresión (cm) no puede ser mayor que 100.'],
            },
            {
                field: 'printHeightCm',
                errors: ['El alto de impresión (cm) debe ser como mínimo 0,5.'],
            },
        ])
        // The print area now belongs to each color.
        await updateTemplate('coolers', {
            printArea: AREA,
            printWidthCm: 20,
            printHeightCm: 20,
        }).expect(400)
        expect(category('coolers')).toMatchObject({
            designPrintWidthCm: null,
            designPrintHeightCm: null,
        })
    })

    it('makes a photo-only category designable and stores the chosen garment color', async () => {
        // Photo without a size yet: not designable.
        const white = await colorId('coolers', 'Blanco', '#FFFFFF')
        expect(await publicCategory('coolers')).toMatchObject({ designEnabled: false })
        const refused = await uploadDesign('cool-001', undefined, white).expect(400)
        expect(refused.body.message).toBe('Este producto no admite diseños con tu imagen.')

        await updateColor('coolers', white, { printArea: AREA }).expect(200)
        await updateTemplate('coolers', { printWidthCm: 40, printHeightCm: 26.67 }).expect(200)
        const black = await colorId('coolers', 'Negro', '#1F2937')

        expect(await publicCategory('coolers')).toMatchObject({
            designEnabled: true,
            designTemplate: {
                printWidthCm: 40,
                printHeightCm: 26.67,
                colors: [
                    {
                        id: white,
                        name: 'Blanco',
                        hex: '#FFFFFF',
                        imageUrl:
                            'https://res.cloudinary.com/demo/image/upload/design-templates/t1.jpg',
                        width: 1200,
                        height: 900,
                        printArea: AREA,
                    },
                    { id: black, name: 'Negro', hex: '#1F2937', printArea: AREA },
                ],
            },
            designPrintSize: { widthCm: 40, heightCm: 26.67 },
        })

        // The color is required and must be one of the category's.
        const noColor = await uploadDesign('cool-001').expect(400)
        expect(noColor.body.details).toEqual([
            { field: 'templateColorId', errors: ['Elige el color de tu producto.'] },
        ])
        const otherCategory = await colorId('tees', 'Negro')
        const foreign = await uploadDesign('cool-001', undefined, otherCategory).expect(400)
        expect(foreign.body.message).toBe('Ese color ya no está disponible. Elige otro.')

        const design = await uploadDesign('cool-001', undefined, black, {
            widthCm: 40,
            heightCm: 26.67,
        }).expect(201)
        // 2362 px over 40 cm (15.75 in): 150 DPI.
        expect(design.body).toMatchObject({
            dpiEstimate: 150,
            dpiLevel: 'ok',
            color: { name: 'Negro', hex: '#1F2937' },
        })
        const row = db.table(Design).find((item) => item.id === design.body.id) as Row
        expect(row).toMatchObject({ colorName: 'Negro', colorHex: '#1F2937' })
        expect(row.printSize).toEqual({ widthCm: 40, heightCm: 26.67 })

        // The snapshot survives a rename.
        await updateColor('coolers', black, { colorName: 'Carbón' }).expect(200)
        expect(row.colorName).toBe('Negro')
    })

    it('keeps the illustration templates colorless', async () => {
        await updateTemplate('mugs', { printWidthCm: 10, printHeightCm: 4.25 }).expect(200)
        const design = await uploadDesign('mug-001', 'v-15oz', undefined, {
            widthCm: 10,
            heightCm: 4.25,
        }).expect(201)
        // 2362 px over 10 cm: 600 DPI (the hardcoded 20 cm would give 300).
        expect(design.body).toMatchObject({ dpiEstimate: 600, color: null })
        expect(db.table(Design).at(-1)).toMatchObject({ colorName: null, colorHex: null })
        expect(await publicCategory('mugs')).toMatchObject({
            designTemplate: null,
            designPrintSize: { widthCm: 10, heightCm: 4.25 },
        })

        const tee = await colorId('tees', 'Negro')
        const refused = await uploadDesign('mug-001', 'v-15oz', tee).expect(400)
        expect(refused.body.details[0].field).toBe('templateColorId')
    })

    it('replaces, reorders and removes colors, deleting the stored files', async () => {
        const white = await colorId('coolers', 'Blanco', '#FFFFFF')
        await updateColor('coolers', white, { printArea: AREA }).expect(200)
        await updateTemplate('coolers', { printWidthCm: 30, printHeightCm: 20 }).expect(200)
        const black = await colorId('coolers', 'Negro')

        // Replacing keeps the placed area and deletes the previous file.
        const replaced = await http()
            .post(colorPath('coolers', white, '/photo'))
            .set('Cookie', cookie('admin'))
            .attach('file', jpeg(800, 1000), { filename: 'b.jpg', contentType: 'image/jpeg' })
            .expect(201)
        expect(replaced.body.designTemplateSettings.colors[0]).toMatchObject({
            id: white,
            width: 800,
            height: 1000,
            printArea: AREA,
        })
        expect(storage.delete.mock.calls).toEqual([['manada-russo/design-templates/t1']])
        const small = await http()
            .post(colorPath('coolers', white, '/photo'))
            .set('Cookie', cookie('admin'))
            .attach('file', jpeg(500, 500), { filename: 'b.jpg', contentType: 'image/jpeg' })
            .expect(400)
        expect(small.body.details[0].field).toBe('file')

        const reorder = (colorIds: string[]) =>
            http()
                .patch('/api/admin/categories/coolers/design-template/colors/order')
                .set('Cookie', cookie('admin'))
                .send({ colorIds })
        const mismatch = await reorder([black]).expect(400)
        expect(mismatch.body.message).toBe(
            'La lista debe incluir exactamente todos los colores de la plantilla, cada uno una sola vez.',
        )
        const reordered = await reorder([black, white]).expect(200)
        expect(
            (reordered.body.designTemplateSettings.colors as Row[]).map((color) => color.name),
        ).toEqual(['Negro', 'Blanco'])

        const removed = await http()
            .delete(colorPath('coolers', black))
            .set('Cookie', cookie('admin'))
            .expect(200)
        expect(storage.delete.mock.calls.at(-1)).toEqual(['manada-russo/design-templates/t2'])
        expect(removed.body.designTemplateSettings.colors).toHaveLength(1)
        await http().delete(colorPath('coolers', black)).set('Cookie', cookie('admin')).expect(404)

        const last = await http()
            .delete(colorPath('coolers', white))
            .set('Cookie', cookie('admin'))
            .expect(200)
        expect(last.body).toMatchObject({
            designEnabled: false,
            designTemplate: null,
            designTemplateSettings: {
                colors: [],
                printWidthCm: 30,
                printHeightCm: 20,
                hasIllustration: false,
                designDisabled: false,
            },
        })
        await uploadDesign('cool-001', undefined, white).expect(400)
    })
})
