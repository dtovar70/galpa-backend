import type { INestApplication } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Test } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import request from 'supertest'
import { CONTACT_EVENTS } from '../src/contact/contact.events.js'
import { catalogRepository } from './fixtures/catalogs.js'

/** The contact form with the Telegram bot off (delivery through it is in telegram.e2e-spec). */
describe('Contact form without Telegram (e2e)', () => {
    let app: INestApplication
    let events: string[]

    const dataSourceStub = {
        isInitialized: false,
        entityMetadatas: [],
        options: { type: 'postgres' },
        manager: {},
        getRepository: (entity: unknown) =>
            catalogRepository(entity) ?? { find: () => Promise.resolve([]) },
    }

    const form = (overrides: Record<string, unknown> = {}) => ({
        name: 'Ana Pérez',
        email: 'ana@example.com',
        topic: 'ASESORIA',
        message: 'Necesito climatizar una oficina de 40 m².',
        ...overrides,
    })
    const send = (body: unknown) =>
        request(app.getHttpServer())
            .post('/api/contact')
            .send(body as object)

    beforeAll(() => {
        process.env.TELEGRAM_ENABLED = 'false'
    })

    beforeEach(async () => {
        events = []
        // Imported here: the configuration is read when the module is loaded.
        const { AppModule } = await import('../src/app.module.js')
        const { createValidationPipe } = await import('../src/common/pipes/validation.pipe.js')
        const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(getDataSourceToken())
            .useValue(dataSourceStub)
            .compile()
        app = moduleFixture.createNestApplication()
        app.setGlobalPrefix('api')
        app.useGlobalPipes(createValidationPipe())
        await app.init()
        app.get(EventEmitter2).onAny((name) => events.push(String(name)))
    })

    afterEach(async () => {
        await app.close()
    })

    it('answers 503 with the WhatsApp fallback when nobody can receive the message', async () => {
        const { body } = await send(form()).expect(503)
        expect(body).toMatchObject({
            code: 'CONTACT_UNAVAILABLE',
            message: 'No pudimos enviar tu mensaje. Escríbenos por WhatsApp.',
        })
        expect(events).not.toContain(CONTACT_EVENTS.messageReceived)
    })

    it('validates every field with Spanish messages', async () => {
        const { body } = await send({
            name: 'A',
            email: 'no-es-correo',
            phone: '4141234567',
            topic: 'spam',
            spaceType: 'INDUSTRIAL',
            areaM2: 9000,
            productSlug: 'No Es Slug',
            message: 'Hola',
            extra: true,
        }).expect(400)
        const fields = Object.fromEntries(
            (body.details as { field: string; errors: string[] }[]).map((d) => [d.field, d.errors]),
        )
        expect(fields).toEqual({
            name: ['Escribe tu nombre y apellido.'],
            email: ['El correo debe ser un correo válido, por ejemplo hola@correo.com.'],
            phone: ['Escribe un celular válido, por ejemplo 0412-5550134.'],
            topic: ['El tema no es válido.'],
            spaceType: ['El tipo de espacio no es válido.'],
            areaM2: ['El área en metros cuadrados no puede ser mayor que 5.000.'],
            productSlug: ['El producto no es válido.'],
            message: ['Cuéntanos un poco más, al menos 15 caracteres.'],
            extra: ['El campo "extra" no está permitido.'],
        })

        await send(form({ message: 'x'.repeat(601) })).expect(400)
        const nameless = await send(form({ name: undefined })).expect(400)
        expect(nameless.body.details[0].field).toBe('name')
    })

    it('accepts the advisory fields and the older `fullName` field', async () => {
        // Valid: reaches the delivery check (503 here, nobody can receive it).
        await send(
            form({ spaceType: 'COMERCIAL', areaM2: 45, productSlug: 'split-daikin-9000' }),
        ).expect(503)
        await send(form({ name: undefined, fullName: 'Ana Pérez' })).expect(503)
    })

    it('refuses a WhatsApp on an inactive operator code on the phone field', async () => {
        const { body } = await send(form({ phone: '0426-1234567' })).expect(400)
        expect(body.details).toEqual([
            { field: 'phone', errors: ['El código 0426 no está disponible.'] },
        ])
    })

    it('treats an empty phone as not sent', async () => {
        // Reaches the delivery check (503 here), so the empty phone passed validation.
        await send(form({ phone: '' })).expect(503)
    })

    it('silently accepts and drops a filled honeypot', async () => {
        const { body } = await send(form({ website: 'https://spam.example' })).expect(202)
        expect(body).toEqual({ message: 'Recibimos tu mensaje. Te respondemos pronto.' })
        expect(events).not.toContain(CONTACT_EVENTS.messageReceived)
    })

    it('limits each IP to 5 messages every 15 minutes', async () => {
        for (let i = 0; i < 5; i++) await send(form({ website: 'bot' })).expect(202)
        await send(form({ website: 'bot' })).expect(429)
    })
})
