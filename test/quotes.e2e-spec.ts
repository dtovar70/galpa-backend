import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { createValidationPipe } from '../src/common/pipes/validation.pipe.js'
import { AdminQuotesController, QuotesController } from '../src/quotes/quotes.controller.js'
import { QuotesService } from '../src/quotes/quotes.service.js'

/**
 * Mounts only the quote controllers (no auth guards, service mocked) to check routing,
 * validation and the PDF responses.
 */
describe('Quotes routes (e2e)', () => {
    let app: INestApplication
    const pdf = { filename: 'cotizacion-COT-000045.pdf', content: Buffer.from('%PDF-1.7') }
    const service = {
        list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 10 }),
        create: vi.fn().mockResolvedValue({ code: 'COT-000045' }),
        update: vi.fn().mockResolvedValue({ code: 'COT-000045' }),
        changeStatus: vi.fn().mockResolvedValue({ code: 'COT-000045' }),
        pdf: vi.fn().mockResolvedValue(pdf),
        publicPdf: vi.fn().mockResolvedValue(pdf),
        convert: vi.fn().mockResolvedValue({ orderCode: 'GP-000001', customerUrl: 'u' }),
        remove: vi.fn().mockResolvedValue(undefined),
    }

    const quote = (overrides: Record<string, unknown> = {}) => ({
        customerName: 'Hotel Los Andes',
        customerEmail: 'compras@losandes.com',
        customerPhone: '0414-1234567',
        validUntil: '2999-12-31',
        discount: 10,
        items: [
            { productId: 'p1', description: 'Piso-techo 36.000 BTU', quantity: 2, unitPrice: 1950 },
            { description: 'Instalación', quantity: 1, unitPrice: 120 },
        ],
        ...overrides,
    })

    beforeEach(async () => {
        vi.clearAllMocks()
        const moduleFixture = await Test.createTestingModule({
            controllers: [AdminQuotesController, QuotesController],
            providers: [{ provide: QuotesService, useValue: service }],
        }).compile()
        app = moduleFixture.createNestApplication()
        app.setGlobalPrefix('api')
        app.useGlobalPipes(createValidationPipe())
        await app.init()
    })

    afterEach(async () => {
        await app.close()
    })

    it('creates a quote with product and free-text lines', async () => {
        await request(app.getHttpServer()).post('/api/admin/quotes').send(quote()).expect(201)
        expect(service.create).toHaveBeenCalledWith(
            expect.objectContaining({
                customerName: 'Hotel Los Andes',
                items: [
                    expect.objectContaining({ productId: 'p1', quantity: 2, unitPrice: 1950 }),
                    expect.objectContaining({ description: 'Instalación' }),
                ],
            }),
            undefined,
        )
    })

    it('validates the quote in Spanish', async () => {
        const { body } = await request(app.getHttpServer())
            .post('/api/admin/quotes')
            .send(
                quote({
                    customerName: 'A',
                    customerEmail: 'no-es-correo',
                    validUntil: '31/12/2999',
                    items: [{ description: '', quantity: 0, unitPrice: -1 }],
                }),
            )
            .expect(400)
        const fields = Object.fromEntries(
            (body.details as { field: string; errors: string[] }[]).map((d) => [d.field, d.errors]),
        )
        expect(fields).toMatchObject({
            customerName: ['Escribe el nombre del cliente.'],
            customerEmail: [
                'El correo del cliente debe ser un correo válido, por ejemplo hola@correo.com.',
            ],
            validUntil: ['La fecha de vigencia debe tener el formato AAAA-MM-DD.'],
            'items.0.description': ['La descripción es obligatoria.'],
            'items.0.quantity': ['La cantidad debe ser como mínimo 1.'],
            'items.0.unitPrice': ['El precio unitario no puede ser negativo.'],
        })
        expect(service.create).not.toHaveBeenCalled()
    })

    it('lists with filters and changes the status', async () => {
        await request(app.getHttpServer())
            .get('/api/admin/quotes?status=ENVIADA&search=andes&page=2')
            .expect(200)
        expect(service.list).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'ENVIADA', search: 'andes', page: 2 }),
        )
        await request(app.getHttpServer())
            .post('/api/admin/quotes/COT-000045/status')
            .send({ status: 'ACEPTADA' })
            .expect(200)
        await request(app.getHttpServer())
            .post('/api/admin/quotes/COT-000045/status')
            .send({ status: 'PERDIDA' })
            .expect(400)
    })

    it('serves the PDF to the admin (download) and behind its link (inline)', async () => {
        const admin = await request(app.getHttpServer())
            .get('/api/admin/quotes/COT-000045/pdf')
            .expect(200)
        expect(admin.headers['content-type']).toBe('application/pdf')
        expect(admin.headers['content-disposition']).toBe(
            'attachment; filename="cotizacion-COT-000045.pdf"',
        )
        const shared = await request(app.getHttpServer())
            .get('/api/quotes/COT-000045/pdf?t=token')
            .expect(200)
        expect(shared.headers['content-disposition']).toMatch(/^inline;/)
        expect(service.publicPdf).toHaveBeenCalledWith('COT-000045', 'token')
    })

    it('converts with a delivery and a payment method', async () => {
        await request(app.getHttpServer())
            .post('/api/admin/quotes/COT-000045/convert')
            .send({ deliveryMethod: 'pickup', paymentMethod: 'ZELLE' })
            .expect(200)
            .expect({ orderCode: 'GP-000001', customerUrl: 'u' })
        await request(app.getHttpServer())
            .post('/api/admin/quotes/COT-000045/convert')
            .send({ deliveryMethod: 'drone', paymentMethod: 'EFECTIVO' })
            .expect(400)
        await request(app.getHttpServer()).delete('/api/admin/quotes/COT-000045').expect(204)
    })
})
