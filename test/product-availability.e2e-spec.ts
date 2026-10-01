import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { createValidationPipe } from '../src/common/pipes/validation.pipe.js'
import { AVAILABILITY_MAX_ITEMS } from '../src/products/products.constants.js'
import { STORAGE_SERVICE, type StorageService } from '../src/storage/storage.service.js'

import { FakeDb } from './fixtures/fake-orders-db.js'

describe('Cart availability (e2e)', () => {
    let app: INestApplication
    let db: FakeDb

    const check = (body: unknown) =>
        request(app.getHttpServer())
            .post('/api/products/availability')
            .send(body as object)

    beforeEach(async () => {
        db = new FakeDb()
        const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(getDataSourceToken())
            .useValue(db.dataSource)
            .overrideProvider(STORAGE_SERVICE)
            .useValue({ driver: 'local' } as unknown as StorageService)
            .compile()
        app = moduleFixture.createNestApplication()
        app.setGlobalPrefix('api')
        app.useGlobalPipes(createValidationPipe())
        await app.init()
    })

    afterEach(async () => {
        await app.close()
    })

    it('returns the live stock of each line, in request order, without a session', async () => {
        db.setVariantStock('v-220v', 1)
        const response = await check({
            items: [
                { productId: 'split-001', variantId: 'v-220v' },
                { productId: 'remote-001' },
                { productId: 'split-001', variantId: 'v-110v' },
            ],
        }).expect(200)

        expect(response.headers['cache-control']).toBe('no-store')
        expect(response.body).toEqual({
            items: [
                {
                    productId: 'split-001',
                    variantId: 'v-220v',
                    stock: 1,
                    stockMode: 'STOCK',
                    isActive: true,
                    exists: true,
                },
                {
                    productId: 'remote-001',
                    variantId: null,
                    stock: 3,
                    stockMode: 'STOCK',
                    isActive: true,
                    exists: true,
                },
                {
                    productId: 'split-001',
                    variantId: 'v-110v',
                    stock: 3,
                    stockMode: 'STOCK',
                    isActive: true,
                    exists: true,
                },
            ],
        })
    })

    it('reports inactive products and lines that no longer exist', async () => {
        const { body } = await check({
            items: [
                { productId: 'off-001' },
                { productId: 'gone-001', variantId: 'v-220v' },
                { productId: 'cap-001', variantId: 'v-220v' },
                { productId: 'split-001', variantId: '' },
            ],
        }).expect(200)

        expect(body.items).toEqual([
            {
                productId: 'off-001',
                variantId: null,
                stock: 9,
                stockMode: 'STOCK',
                isActive: false,
                exists: true,
            },
            {
                productId: 'gone-001',
                variantId: 'v-220v',
                stock: 0,
                stockMode: 'STOCK',
                isActive: false,
                exists: false,
            },
            {
                productId: 'cap-001',
                variantId: 'v-220v',
                stock: 0,
                stockMode: 'STOCK',
                isActive: true,
                exists: false,
            },
            // A product with variants needs one (the checkout refuses the line otherwise).
            {
                productId: 'split-001',
                variantId: null,
                stock: 0,
                stockMode: 'STOCK',
                isActive: true,
                exists: false,
            },
        ])
    })

    it('reports ON_ORDER products as always available', async () => {
        const { body } = await check({ items: [{ productId: 'cassette-001' }] }).expect(200)
        expect(body.items).toEqual([
            {
                productId: 'cassette-001',
                variantId: null,
                stock: 99,
                stockMode: 'ON_ORDER',
                isActive: true,
                exists: true,
            },
        ])
    })

    it('validates the body and caps the number of lines', async () => {
        const empty = await check({ items: [] }).expect(400)
        expect(empty.body.details).toEqual([
            { field: 'items', errors: ['La lista de productos debe tener al menos 1 elemento.'] },
        ])

        const tooMany = Array.from({ length: AVAILABILITY_MAX_ITEMS + 1 }, () => ({
            productId: 'split-001',
        }))
        const capped = await check({ items: tooMany }).expect(400)
        expect(capped.body.details[0]).toEqual({
            field: 'items',
            errors: [
                `La lista de productos admite como máximo ${AVAILABILITY_MAX_ITEMS} elementos.`,
            ],
        })

        const bad = await check({ items: [{ productId: '', quantity: 2 }] }).expect(400)
        expect(bad.body.details).toEqual(
            expect.arrayContaining([
                { field: 'items.0.productId', errors: ['El producto es obligatorio.'] },
                {
                    field: 'items.0.quantity',
                    errors: ['El campo "quantity" no está permitido.'],
                },
            ]),
        )
        await check({}).expect(400)
    })
})
