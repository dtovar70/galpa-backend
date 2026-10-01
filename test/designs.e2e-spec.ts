import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import cookieParser from 'cookie-parser'
import { Readable } from 'node:stream'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { CategoryDesignTemplate } from '../src/categories/entities/category-design-template.entity.js'
import { createValidationPipe } from '../src/common/pipes/validation.pipe.js'
import { Design } from '../src/designs/entities/design.entity.js'
import { DesignsService, DESIGN_TTL_MS } from '../src/designs/designs.service.js'
import { OrderItem } from '../src/orders/entities/order-item.entity.js'
import { Product } from '../src/products/entities/product.entity.js'
import { STORAGE_SERVICE, type StorageService } from '../src/storage/storage.service.js'
import { DesignAsset } from '../src/designs/entities/design-asset.entity.js'
import {
    artworkPng,
    attachDesign,
    imageLayer,
    jpeg,
    PLACEMENT,
    png,
    textLayer,
    type DesignUploadParts,
} from './fixtures/designs.js'
import { FakeDb, USERS, type Row } from './fixtures/fake-orders-db.js'

describe('Designs (e2e)', () => {
    let app: INestApplication
    let db: FakeDb
    let cookie: (user: keyof typeof USERS) => string
    let uploads = 0
    const storage = {
        driver: 'local' as const,
        upload: vi.fn(),
        delete: vi.fn(),
        uploadPrivate: vi.fn(),
        readPrivate: vi.fn(),
        deletePrivate: vi.fn().mockResolvedValue(undefined),
    }

    const http = () => request(app.getHttpServer())

    const upload = (fields: Row = {}, files: Omit<DesignUploadParts, 'fields'> = {}) =>
        attachDesign(http().post('/api/designs'), {
            fields: {
                productId: 'mug-001',
                variantId: 'v-15oz',
                layers: [imageLayer(0)],
                ...fields,
            },
            ...files,
        })

    const checkout = (items: Row[]) =>
        http().post('/api/orders').send({
            fullName: 'Ana Pérez',
            email: 'ana@example.com',
            phone: '0414-1234567',
            city: 'Caracas',
            address: 'Av. Principal, casa 4',
            notes: '',
            deliveryMethod: 'delivery',
            items,
        })

    const designRow = (id: string) => db.table(Design).find((row) => row.id === id) as Row

    beforeEach(async () => {
        db = new FakeDb()
        uploads = 0
        vi.clearAllMocks()
        storage.uploadPrivate.mockImplementation((_image: unknown, folder: string) =>
            Promise.resolve({ key: `${folder}/file-${++uploads}.png` }),
        )
        storage.readPrivate.mockImplementation((key: string) =>
            Promise.resolve({
                kind: 'stream',
                stream: Readable.from([Buffer.from(`bytes of ${key}`)]),
                contentType: 'image/png',
                size: Buffer.byteLength(`bytes of ${key}`),
            }),
        )
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

    it('stores every file privately and serves the preview only with its token', async () => {
        const { body } = await upload(
            {
                layers: [
                    imageLayer(1, 0),
                    textLayer(5, { content: '  Sofía\n7  ' }),
                    imageLayer(0, 2, { x: 0.1, y: 0, scale: 0.5, rotation: 15 }),
                ],
            },
            {
                originals: [
                    { buffer: png(1181, 1181), type: 'image/png', name: 'luna.png' },
                    { buffer: jpeg(2362, 1004) },
                ],
            },
        ).expect(201)
        // Layers bottom to top: image 1 (asset 1, 2362 px over 20 cm), the image of asset 0
        // (1181 px over 10 cm: 300 DPI), then the text (z 5 is the top).
        expect(body).toMatchObject({
            dpiEstimate: 300,
            dpiLevel: 'ok',
            layers: [
                { index: 0, type: 'image', dpi: 300, dpiLevel: 'ok' },
                { index: 1, type: 'image', dpi: 300, dpiLevel: 'ok' },
                { index: 2, type: 'text', dpi: null, dpiLevel: null },
            ],
        })
        expect(body.previewToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(body.previewPath).toBe(
            `/designs/${body.id as string}/preview?t=${body.previewToken as string}`,
        )
        // The originals (bottom to top), the arte final, the preview: all private.
        expect(storage.uploadPrivate).toHaveBeenCalledTimes(4)
        expect(storage.uploadPrivate.mock.calls.map((call) => call[1])).toEqual([
            'designs',
            'designs',
            'designs',
            'designs',
        ])
        expect(storage.uploadPrivate.mock.calls.map((call) => (call[0] as Row).type)).toEqual([
            'jpeg',
            'png',
            'png',
            'png',
        ])

        const row = designRow(body.id as string)
        expect(row).toMatchObject({
            productId: 'mug-001',
            variantId: 'v-15oz',
            previewKey: 'designs/file-4.png',
            printSize: { widthCm: 20, heightCm: 8.5 },
            dpiEstimate: 300,
            attachedAt: null,
        })
        expect(row.layers).toEqual([
            {
                type: 'image',
                z: 0,
                assetIndex: 1,
                placement: PLACEMENT,
                format: 'jpg',
                width: 2362,
                height: 1004,
                bytes: jpeg(2362, 1004).length,
                dpi: 300,
            },
            {
                type: 'image',
                z: 1,
                assetIndex: 0,
                placement: { x: 0.1, y: 0, scale: 0.5, rotation: 15 },
                format: 'png',
                width: 1181,
                height: 1181,
                bytes: png(1181, 1181).length,
                dpi: 300,
            },
            {
                type: 'text',
                z: 2,
                placement: { x: 0, y: 0.2, scale: 1, rotation: 0 },
                content: 'Sofía\n7',
                font: 'pacifico',
                color: '#E75F9B',
                outline: 'white',
                align: 'center',
            },
        ])
        const assets = db.table(DesignAsset).filter((asset) => asset.designId === body.id)
        expect(assets).toEqual([
            expect.objectContaining({
                kind: 'original',
                layerIndex: 0,
                storageKey: 'designs/file-1.png',
                format: 'jpg',
                width: 2362,
            }),
            expect.objectContaining({
                kind: 'original',
                layerIndex: 1,
                storageKey: 'designs/file-2.png',
                format: 'png',
            }),
            expect.objectContaining({
                kind: 'artwork',
                layerIndex: null,
                storageKey: 'designs/file-3.png',
                format: 'png',
                width: 1575,
                height: 669,
                dpi: 200,
            }),
        ])
        // Only the hash of the token is kept.
        expect(row.previewTokenHash).toMatch(/^[a-f0-9]{64}$/)
        expect(row.previewTokenHash).not.toBe(body.previewToken)

        const preview = await http()
            .get(`/api${body.previewPath as string}`)
            .expect(200)
        expect(preview.headers['cache-control']).toBe('private, no-store')
        expect(preview.body.toString()).toBe('bytes of designs/file-4.png')
        await http()
            .get(`/api/designs/${body.id as string}/preview?t=${'x'.repeat(43)}`)
            .expect(404)
        await http()
            .get(`/api/designs/${body.id as string}/preview`)
            .expect(404)
    })

    it('accepts a design with only text', async () => {
        const { body } = await upload(
            { layers: [textLayer(0, { font: 'bebas', outline: 'none', align: 'left' })] },
            { originals: null },
        ).expect(201)
        expect(body).toMatchObject({
            dpiEstimate: null,
            dpiLevel: null,
            layers: [{ index: 0, type: 'text', dpi: null }],
        })
        expect(designRow(body.id as string).dpiEstimate).toBeNull()
        expect(db.table(DesignAsset).map((asset) => asset.kind)).toEqual(['artwork'])
    })

    it('estimates a low resolution per image without refusing the design', async () => {
        const { body } = await upload(
            {
                layers: [
                    imageLayer(0, 0, { ...PLACEMENT, scale: 2 }),
                    imageLayer(1, 1, { ...PLACEMENT, scale: 0.25 }),
                ],
            },
            {
                originals: [
                    { buffer: png(800, 400), type: 'image/png' },
                    { buffer: png(800, 400), type: 'image/png' },
                ],
            },
        ).expect(201)
        // 800 px over 40 cm (15.7 in): 51 DPI; over 5 cm: 406 DPI. The design keeps the lowest.
        expect(body).toMatchObject({
            dpiEstimate: 51,
            dpiLevel: 'veryLow',
            layers: [
                { dpi: 51, dpiLevel: 'veryLow' },
                { dpi: 406, dpiLevel: 'ok' },
            ],
        })
    })

    it('refuses originals with too many pixels, by their header', async () => {
        // A small file declaring a huge canvas is refused by its header (no decoding).
        for (const huge of [jpeg(12_001, 1000), png(10_000, 8_001)]) {
            const tooManyPixels = await upload({}, { originals: [{ buffer: huge }] }).expect(400)
            expect(tooManyPixels.body.details).toEqual([
                {
                    field: 'originals',
                    errors: [
                        'Tu imagen es demasiado grande: puede medir como máximo 12.000 × 12.000 px (80 megapíxeles).',
                    ],
                },
            ])
        }
        expect(db.table(Design)).toHaveLength(0)
    })

    it('validates the product, the files (by their bytes) and their sizes', async () => {
        const tee = await upload({ productId: 'tee-001', variantId: 'v-m' }).expect(400)
        expect(tee.body.message).toBe('Este producto no admite diseños con tu imagen.')

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
        await upload({ productId: 'cool-001', variantId: undefined }).expect(400)
        await upload({ productId: 'off-001', variantId: undefined }).expect(400)

        const variant = await upload({ variantId: undefined }).expect(400)
        expect(variant.body.details).toEqual([
            { field: 'variantId', errors: ['Elige una opción del producto.'] },
        ])

        // A GIF (or anything) sent as image/jpeg is refused by its signature.
        const gif = await upload(
            {},
            { originals: [{ buffer: Buffer.from('GIF89a-not-really') }] },
        ).expect(400)
        expect(gif.body.message).toBe('Tu imagen debe ser JPG, PNG o WEBP.')
        const svg = await upload(
            {},
            { originals: [{ buffer: jpeg(10, 10), type: 'image/svg+xml' }] },
        ).expect(400)
        expect(svg.body.message).toBe('Tu imagen debe ser JPG, PNG o WEBP.')
        const jpegPreview = await upload({}, { preview: jpeg(10, 10) }).expect(400)
        expect(jpegPreview.body.message).toBe('La vista previa del diseño debe ser una imagen PNG.')
        const jpegArtwork = await upload({}, { artwork: jpeg(1575, 669) }).expect(400)
        expect(jpegArtwork.body.details[0]).toMatchObject({ field: 'artwork' })
        const missingArtwork = await upload({}, { artwork: null }).expect(400)
        expect(missingArtwork.body.message).toBe('Falta el arte final del diseño.')
        // The arte final has the print area's shape (20 × 8.5 cm) at 100–200 DPI.
        const wrongSize = await upload({}, { artwork: png(800, 669) }).expect(400)
        expect(wrongSize.body.message).toBe(
            'El arte final no coincide con el área de impresión. Vuelve a abrir el editor.',
        )
        // 1772 px over 20 cm: 225 DPI, too sharp; 591 px: 75 DPI, too soft.
        await upload({}, { artwork: png(1772, 753) }).expect(400)
        await upload({}, { artwork: png(591, 251) }).expect(400)
        await upload({}, { artwork: png(1590, 676) }).expect(201)
        const { body: lighter } = await upload({}, { artwork: png(787, 334) }).expect(201)
        expect(
            db
                .table(DesignAsset)
                .find((asset) => asset.designId === lighter.id && asset.kind === 'artwork'),
        ).toMatchObject({ width: 787, height: 334, dpi: 100 })

        const bigPreview = Buffer.concat([png(800, 667), Buffer.alloc(2 * 1024 * 1024)])
        await upload({}, { preview: bigPreview }).expect(400)
        // Cloudinary's free plan stores files of up to 10 MB: the arte final too.
        const bigArtwork = Buffer.concat([artworkPng(), Buffer.alloc(10 * 1024 * 1024)])
        const hugeFile = await upload({}, { artwork: bigArtwork }).expect(413)
        expect(hugeFile.body.message).toBe(
            'Cada archivo de tu diseño puede pesar como máximo 10 MB.',
        )
        const bigOriginal = Buffer.concat([jpeg(10, 10), Buffer.alloc(10 * 1024 * 1024)])
        const tooLarge = await upload({}, { originals: [{ buffer: bigOriginal }] }).expect(413)
        expect(tooLarge.body.message).toBe(
            'Cada archivo de tu diseño puede pesar como máximo 10 MB.',
        )

        const six = Array.from({ length: 6 }, () => ({ buffer: jpeg(100, 100) }))
        const tooMany = await upload(
            { layers: six.map((_, index) => imageLayer(index)) },
            { originals: six },
        ).expect(400)
        expect(tooMany.body.message).toBe('Puedes usar hasta 5 imágenes por diseño.')

        await upload({}, { originals: null }).expect(400)
        expect(storage.uploadPrivate).toHaveBeenCalledTimes(6)
        expect(db.table(Design)).toHaveLength(2)
    })

    it('validates the layers: counts, texts, fonts, colors and placements', async () => {
        const refused = async (layers: unknown, originals = 1) => {
            const response = await upload(
                { layers: typeof layers === 'string' ? layers : JSON.stringify(layers) },
                {
                    originals: Array.from({ length: originals }, () => ({
                        buffer: jpeg(500, 500),
                    })),
                },
            ).expect(400)
            expect(response.body.details[0].field).toBe('layers')
            return response.body.message as string
        }

        expect(await refused('[{"type":')).toBe('Las capas del diseño no son válidas.')
        expect(await refused([], 0)).toBe('Agrega una imagen o un texto a tu diseño.')
        expect(await refused([{ type: 'sticker', z: 0 }], 0)).toBe(
            'Las capas del diseño no son válidas.',
        )
        expect(await refused([textLayer(0), textLayer(1), textLayer(2), textLayer(3)], 0)).toBe(
            'Puedes usar hasta 3 textos por diseño.',
        )
        // Every original belongs to exactly one image layer.
        expect(await refused([imageLayer(0)], 2)).toBe(
            'Cada imagen del diseño debe venir con su archivo original.',
        )
        expect(await refused([imageLayer(0, 0), imageLayer(0, 1)], 2)).toBe(
            'Cada imagen del diseño debe venir con su archivo original.',
        )
        expect(await refused([imageLayer(0, 0), textLayer(0)])).toBe(
            'El orden de las capas no es válido.',
        )
        expect(await refused([imageLayer(0), textLayer(1, { content: '   ' })])).toBe(
            'Escribe el texto 1 con 1 a 60 caracteres, en 2 líneas como máximo.',
        )
        expect(await refused([imageLayer(0), textLayer(1, { content: 'x'.repeat(61) })])).toMatch(
            /^Escribe el texto 1/,
        )
        expect(await refused([imageLayer(0), textLayer(1, { content: 'a\nb\nc' })])).toMatch(
            /^Escribe el texto 1/,
        )
        expect(await refused([imageLayer(0), textLayer(1, { font: 'Comic Sans' })])).toBe(
            'Elige una de nuestras fuentes para el texto 1.',
        )
        expect(await refused([imageLayer(0), textLayer(1, { color: 'pink' })])).toBe(
            'El color del texto 1 debe ser un color #RRGGBB.',
        )
        expect(await refused([imageLayer(0), textLayer(1, { outline: 'red' })])).toBe(
            'El borde del texto 1 no es válido.',
        )
        expect(await refused([imageLayer(0), textLayer(1, { align: 'justify' })])).toBe(
            'La alineación del texto 1 no es válida.',
        )
        expect(await refused([imageLayer(0, 0, { ...PLACEMENT, scale: 0 })])).toBe(
            'El tamaño de la imagen 1 está fuera de rango.',
        )
        expect(await refused([imageLayer(0, 0, { ...PLACEMENT, x: 'left' })])).toBe(
            'La ubicación de la imagen 1 no es válida.',
        )
        const missing = await upload({ layers: undefined }).expect(400)
        expect(missing.body.details[0]).toMatchObject({ field: 'layers' })

        // 60 characters on two lines is fine.
        await upload({
            layers: [
                imageLayer(0),
                textLayer(1, { content: `${'a'.repeat(30)}\n${'b'.repeat(29)}` }),
            ],
        }).expect(201)
        expect(storage.uploadPrivate).toHaveBeenCalledTimes(3)
    })

    it('limits uploads to 20 per hour per client', async () => {
        for (let attempt = 0; attempt < 20; attempt++) {
            await upload({}, { originals: null, artwork: null, preview: null }).expect(400)
        }
        const limited = await upload().expect(429)
        expect(limited.body.message).toBe(
            'Demasiadas solicitudes. Espera un minuto e intenta de nuevo.',
        )
    })

    it('attaches the design to its order line once, and refuses to reuse it', async () => {
        const { body: design } = await upload().expect(201)
        const created = await checkout([
            { productId: 'mug-001', variantId: 'v-15oz', quantity: 1, designId: design.id },
            { productId: 'mug-001', variantId: 'v-15oz', quantity: 1 },
        ]).expect(201)

        const items = db.table(OrderItem)
        expect(items.map((item) => item.designId)).toEqual([design.id, null])
        expect(designRow(design.id as string).attachedAt).toBeInstanceOf(Date)

        const { code, accessToken, order } = created.body as {
            code: string
            accessToken: string
            order: { items: Row[] }
        }
        expect(order.items[0]?.design).toEqual({
            id: design.id,
            previewPath: `/orders/${code}/designs/${design.id as string}/preview`,
            color: null,
        })
        expect(order.items[1]?.design).toBeNull()

        await http()
            .get(`/api/orders/${code}/designs/${design.id as string}/preview?t=${accessToken}`)
            .expect(200)
        await http()
            .get(`/api/orders/${code}/designs/${design.id as string}/preview?t=${'x'.repeat(43)}`)
            .expect(404)

        const reused = await checkout([
            { productId: 'mug-001', variantId: 'v-15oz', quantity: 1, designId: design.id },
        ]).expect(409)
        expect(reused.body).toMatchObject({
            code: 'ORDER_DESIGN_USED',
            message: 'Este diseño ya se usó en otro pedido; vuelve a crearlo.',
            details: [{ field: 'items.0.designId', errors: [expect.any(String)] }],
        })
        expect(reused.body.lines[0]).toMatchObject({ index: 0, kind: 'design' })
        // Nothing was taken: 5 units of 15 oz minus the first order's 2.
        expect(db.variantStock('v-15oz')).toBe(3)
    })

    it('refuses stale, foreign, mismatched, unknown and repeated designs', async () => {
        const { body: stale } = await upload().expect(201)
        designRow(stale.id as string).createdAt = new Date(Date.now() - DESIGN_TTL_MS - 60_000)
        const staleResponse = await checkout([
            { productId: 'mug-001', variantId: 'v-15oz', quantity: 1, designId: stale.id },
        ]).expect(400)
        expect(staleResponse.body).toMatchObject({
            code: 'ORDER_DESIGN_INVALID',
            message: 'Tu diseño venció (los guardamos 7 días); vuelve a crearlo.',
        })

        // Keychains have the editor turned off (DESIGN_DISABLED_CATEGORIES): no upload.
        await upload(
            { productId: 'key-001', variantId: undefined },
            { artwork: artworkPng({ widthCm: 5, heightCm: 5 }) },
        ).expect(400)

        // A design made for another product (moved to the keychain here) is refused.
        const { body: other } = await upload().expect(201)
        designRow(other.id as string).productId = 'key-001'
        designRow(other.id as string).variantId = null
        const foreign = await checkout([
            { productId: 'mug-001', variantId: 'v-15oz', quantity: 1, designId: other.id },
        ]).expect(400)
        expect(foreign.body.message).toBe('Este diseño es de otro producto; vuelve a crearlo.')

        const { body: fresh } = await upload().expect(201)
        const variant = await checkout([
            { productId: 'mug-001', variantId: 'v-11oz', quantity: 1, designId: fresh.id },
        ]).expect(400)
        expect(variant.body.message).toBe(
            'Este diseño se hizo para otra versión del producto; vuelve a crearlo.',
        )

        await checkout([
            { productId: 'mug-001', variantId: 'v-15oz', quantity: 1, designId: 'nope' },
        ]).expect(400)

        const repeated = await checkout([
            { productId: 'mug-001', variantId: 'v-15oz', quantity: 1, designId: fresh.id },
            { productId: 'mug-001', variantId: 'v-15oz', quantity: 1, designId: fresh.id },
        ]).expect(400)
        expect(repeated.body.details).toEqual([
            {
                field: 'items.1.designId',
                errors: ['Este diseño ya está en otra línea de tu carrito; vuelve a crearlo.'],
            },
        ])

        expect(db.table(OrderItem)).toHaveLength(0)
        expect(designRow(fresh.id as string).attachedAt).toBeNull()
    })

    it('cleans up unattached designs older than 7 days, every file included', async () => {
        const old = new Date(Date.now() - DESIGN_TTL_MS - 60_000)
        const base = {
            productId: 'mug-001',
            variantId: 'v-15oz',
            layers: [],
            printSize: { widthCm: 20, heightCm: 8.5 },
            dpiEstimate: 300,
            previewTokenHash: 'a'.repeat(64),
        }
        const asset = (designId: string, kind: string, storageKey: string, layerIndex = 0) => ({
            id: `${designId}-${storageKey}`,
            designId,
            kind,
            layerIndex: kind === 'artwork' ? null : layerIndex,
            storageKey,
            format: 'png',
            width: 10,
            height: 10,
            bytes: 10,
        })
        db.table(Design).push(
            {
                ...base,
                id: 'stale',
                previewKey: 'designs/s-preview.png',
                attachedAt: null,
                createdAt: old,
            },
            {
                ...base,
                id: 'ordered',
                previewKey: 'designs/o-preview.png',
                attachedAt: old,
                createdAt: old,
            },
            {
                ...base,
                id: 'recent',
                previewKey: 'designs/r-preview.png',
                attachedAt: null,
                createdAt: new Date(),
            },
        )
        db.table(DesignAsset).push(
            asset('stale', 'original', 'designs/s1.png', 0),
            asset('stale', 'original', 'designs/s2.png', 1),
            asset('stale', 'artwork', 'designs/s-art.png'),
            asset('ordered', 'original', 'designs/o1.png'),
            asset('recent', 'artwork', 'designs/r-art.png'),
        )

        expect(await app.get(DesignsService).deleteStale()).toBe(1)
        expect(db.table(Design).map((row) => row.id)).toEqual(['ordered', 'recent'])
        expect(db.table(DesignAsset).map((row) => row.designId)).toEqual(['ordered', 'recent'])
        expect(storage.deletePrivate.mock.calls).toEqual([
            ['designs/s-preview.png'],
            ['designs/s1.png'],
            ['designs/s2.png'],
            ['designs/s-art.png'],
        ])
    })

    it('carries the garment color from the template to the order, customer and admin', async () => {
        // The mugs get two template photos (garment colors).
        const colorRow = (id: string, colorName: string, colorHex: string, sortOrder: number) => ({
            id,
            categorySlug: 'mugs',
            colorName,
            colorHex,
            imageUrl: `https://img/${id}.jpg`,
            publicId: `design-templates/${id}`,
            width: 1200,
            height: 900,
            printArea: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
            sortOrder,
            createdAt: new Date(),
        })
        db.table(CategoryDesignTemplate).push(
            colorRow('c-white', 'Blanco', '#FFFFFF', 0),
            colorRow('c-black', 'Negro', '#1F2937', 1),
        )

        const missing = await upload().expect(400)
        expect(missing.body.message).toBe('Elige el color de tu producto.')
        const { body: design } = await upload({ templateColorId: 'c-black' }).expect(201)
        expect(design.color).toEqual({ name: 'Negro', hex: '#1F2937' })

        const { body: created } = await checkout([
            { productId: 'mug-001', variantId: 'v-15oz', quantity: 1, designId: design.id },
        ]).expect(201)
        const code = created.code as string
        expect(created.order.items[0].design.color).toEqual({ name: 'Negro', hex: '#1F2937' })

        const { body: order } = await http()
            .get(`/api/admin/orders/${code}`)
            .set('Cookie', cookie('editor'))
            .expect(200)
        expect(order.items[0].design.color).toEqual({ name: 'Negro', hex: '#1F2937' })

        // The Telegram album caption names it too.
        const images = await app
            .get(DesignsService)
            .previewImagesForOrder(db.table(OrderItem)[0]!.orderId as string)
        expect(images[0]?.color).toEqual({ name: 'Negro', hex: '#1F2937' })
    })

    it('shows the layers to the admins, with the arte final and each named original', async () => {
        const { body: design } = await upload(
            { layers: [imageLayer(0), textLayer(1), imageLayer(1, 2)] },
            {
                originals: [
                    { buffer: jpeg(2362, 1004) },
                    { buffer: png(400, 400), type: 'image/png' },
                ],
                artwork: png(1181, 502),
            },
        ).expect(201)
        const { body: created } = await checkout([
            { productId: 'mug-001', variantId: 'v-15oz', quantity: 1, designId: design.id },
        ]).expect(201)
        const code = created.code as string
        const itemId = db.table(OrderItem)[0]?.id as string
        const base = `/api/admin/orders/${code}/items/${itemId}/design`
        const path = base.slice('/api'.length)

        const { body: order } = await http()
            .get(`/api/admin/orders/${code}`)
            .set('Cookie', cookie('editor'))
            .expect(200)
        expect(order.items[0]).toMatchObject({
            id: itemId,
            design: {
                id: design.id,
                previewPath: `${path}/preview`,
                printSize: { widthCm: 20, heightCm: 8.5 },
                // 400 px over 20 cm: 51 DPI, the lowest.
                dpiEstimate: 51,
                dpiLevel: 'veryLow',
                // Rendered at 150 DPI (a lighter file).
                artwork: {
                    path: `${path}/artwork`,
                    downloadName: `${code}-linea1-arte-final.png`,
                    width: 1181,
                    height: 502,
                    dpi: 150,
                },
                layers: [
                    {
                        type: 'image',
                        index: 0,
                        number: 1,
                        format: 'jpg',
                        width: 2362,
                        height: 1004,
                        dpi: 300,
                        dpiLevel: 'ok',
                        downloadPath: `${path}/originals/1`,
                        viewPath: `${path}/originals/1/view`,
                        downloadName: `${code}-linea1-imagen1.jpg`,
                    },
                    {
                        type: 'text',
                        index: 1,
                        content: 'Sofía 7',
                        font: 'pacifico',
                        fontLabel: 'Pacifico',
                        color: '#E75F9B',
                        outline: 'white',
                        align: 'center',
                    },
                    {
                        type: 'image',
                        index: 2,
                        number: 2,
                        format: 'png',
                        dpi: 51,
                        dpiLevel: 'veryLow',
                        downloadName: `${code}-linea1-imagen2.png`,
                    },
                ],
            },
        })

        await http().get(`${base}/preview`).expect(401)
        await http().get(`${base}/artwork`).expect(401)
        await http().get(`${base}/originals/1`).expect(401)
        const preview = await http()
            .get(`${base}/preview`)
            .set('Cookie', cookie('editor'))
            .expect(200)
        expect(preview.body.toString()).toBe('bytes of designs/file-4.png')

        const artwork = await http()
            .get(`${base}/artwork`)
            .set('Cookie', cookie('editor'))
            .expect(200)
        expect(artwork.headers['content-disposition']).toBe(
            `attachment; filename="${code}-linea1-arte-final.png"`,
        )
        expect(artwork.body.toString()).toBe('bytes of designs/file-3.png')

        const first = await http()
            .get(`${base}/originals/1`)
            .set('Cookie', cookie('admin'))
            .expect(200)
        expect(first.headers['content-disposition']).toBe(
            `attachment; filename="${code}-linea1-imagen1.jpg"`,
        )
        expect(first.body.toString()).toBe('bytes of designs/file-1.png')
        const second = await http()
            .get(`${base}/originals/2`)
            .set('Cookie', cookie('admin'))
            .expect(200)
        expect(second.headers['content-disposition']).toBe(
            `attachment; filename="${code}-linea1-imagen2.png"`,
        )
        expect(second.body.toString()).toBe('bytes of designs/file-2.png')
        const thumbnail = await http()
            .get(`${base}/originals/2/view`)
            .set('Cookie', cookie('editor'))
            .expect(200)
        expect(thumbnail.headers['content-disposition']).toBe('inline')

        for (const missing of ['originals/3', 'originals/0', 'originals/x']) {
            await http().get(`${base}/${missing}`).set('Cookie', cookie('admin')).expect(404)
        }
        await http()
            .get(`/api/admin/orders/MR-999999/items/${itemId}/design/artwork`)
            .set('Cookie', cookie('admin'))
            .expect(404)
        await http()
            .get(`/api/admin/orders/${code}/items/unknown/design/preview`)
            .set('Cookie', cookie('admin'))
            .expect(404)
    })
})
