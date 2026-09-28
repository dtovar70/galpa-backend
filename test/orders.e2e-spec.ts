import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { getDataSourceToken } from '@nestjs/typeorm'
import cookieParser from 'cookie-parser'
import request from 'supertest'
import { AppModule } from '../src/app.module.js'
import { createValidationPipe } from '../src/common/pipes/validation.pipe.js'
import { caracasDay } from '../src/common/utils/caracas-date.js'
import { DEFAULT_SITE_CONTENT } from '../src/content/content.defaults.js'
import { SiteContentEntry } from '../src/content/entities/site-content.entity.js'
import { ExchangeRate } from '../src/exchange-rate/entities/exchange-rate.entity.js'
import { OrderPayment } from '../src/orders/entities/order-payment.entity.js'
import { OrderAccessLink } from '../src/orders/entities/order-access-link.entity.js'
import { Order } from '../src/orders/entities/order.entity.js'
import { OrderExpiryService } from '../src/orders/order-expiry.service.js'
import { ORDER_EVENTS } from '../src/orders/orders.events.js'
import { Product } from '../src/products/entities/product.entity.js'
import { STORAGE_SERVICE, type StorageService } from '../src/storage/storage.service.js'

import { FakeDb, PAGO_MOVIL, PNG, USERS, type Row } from './fixtures/fake-orders-db.js'

describe('Orders (e2e)', () => {
    let app: INestApplication
    let db: FakeDb
    let cookie: (user: keyof typeof USERS) => string
    let events: { name: string; payload: Row }[]
    const storage = {
        driver: 'local' as const,
        upload: vi.fn(),
        delete: vi.fn(),
        uploadPrivate: vi.fn().mockResolvedValue({ key: 'payment-proofs/proof.png' }),
        readPrivate: vi.fn(),
        deletePrivate: vi.fn().mockResolvedValue(undefined),
    }

    const checkout = (overrides: Row = {}) => ({
        fullName: 'Ana Pérez',
        email: 'ana@example.com',
        phone: '0414-1234567',
        city: 'Caracas',
        address: 'Av. Principal, casa 4',
        notes: '',
        deliveryMethod: 'delivery',
        items: [{ productId: 'mug-001', variantId: 'v-15oz', quantity: 2 }],
        ...overrides,
    })

    const payment = (code: string, token: string, fields: Row = {}) => {
        const req = request(app.getHttpServer()).post(`/api/orders/${code}/payment?t=${token}`)
        const values: Row = {
            reference: '00123456',
            payerBankCode: '0102',
            payerPhone: '0414-1234567',
            paidOn: caracasDay(),
            amountBs: '',
            ...fields,
        }
        for (const [key, value] of Object.entries(values)) req.field(key, String(value))
        return req
    }

    beforeEach(async () => {
        db = new FakeDb()
        events = []
        vi.clearAllMocks()
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

        app.get(EventEmitter2).onAny((name, payload) => {
            events.push({ name: String(name), payload: payload as Row })
        })
        const signer = new JwtService({ secret: app.get(ConfigService).get<string>('JWT_SECRET') })
        cookie = (user) =>
            `mr_session=${signer.sign({ sub: USERS[user].id, role: USERS[user].role }, { expiresIn: 600 })}`
    })

    afterEach(async () => {
        await app.close()
    })

    it('prices the order on the server, decrements stock and returns a private link', async () => {
        const response = await request(app.getHttpServer())
            .post('/api/orders')
            .send(checkout())
            .expect(201)

        const { code, accessToken, order } = response.body as {
            code: string
            accessToken: string
            order: Row & { totals: Row; items: Row[] }
        }
        expect(code).toBe('MR-000001')
        expect(accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
        // (12.90 + 3.10) x 2 = 32.00 < 35 -> + 4.00 shipping.
        expect(order.totals).toMatchObject({
            subtotalUsd: 32,
            shippingUsd: 4,
            totalUsd: 36,
            totalBs: 30760.69,
            exchangeRate: 854.4637,
        })
        expect(order.items[0]).toMatchObject({
            productName: 'Taza Café Primero',
            variantLabel: '15 oz',
            unitPriceUsd: 16,
            quantity: 2,
            imageUrl: 'http://img/taza.jpg',
        })
        expect(order.status).toBe('PENDIENTE_PAGO')
        expect(order.pagoMovil).toEqual(PAGO_MOVIL)
        expect(db.stock('mug-001')).toBe(3)
        // Only the hash is stored.
        expect(db.table(OrderAccessLink)).toHaveLength(1)
        expect(db.table(OrderAccessLink)[0]).toMatchObject({
            orderId: db.table(Order)[0]?.id,
            createdById: null,
        })
        expect(db.table(OrderAccessLink)[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/)
        expect(db.table(OrderAccessLink)[0]?.tokenHash).not.toBe(accessToken)
        expect(events.map((event) => event.name)).toEqual([ORDER_EVENTS.created])

        await request(app.getHttpServer())
            .get(`/api/orders/${code}?t=${accessToken}`)
            .expect(200)
            .expect((res) => expect(res.body.code).toBe(code))
    })

    it('rejects client-side prices and reports stock problems per line', async () => {
        const forged = await request(app.getHttpServer())
            .post('/api/orders')
            .send(
                checkout({
                    items: [
                        { productId: 'mug-001', variantId: 'v-11oz', quantity: 1, unitPrice: 0.01 },
                    ],
                }),
            )
            .expect(400)
        expect(forged.body.details).toEqual([
            { field: 'items.0.unitPrice', errors: ['El campo "unitPrice" no está permitido.'] },
        ])

        const stock = await request(app.getHttpServer())
            .post('/api/orders')
            .send(
                checkout({
                    items: [
                        { productId: 'tee-001', variantId: 'v-m', quantity: 2 },
                        { productId: 'off-001', quantity: 1 },
                    ],
                }),
            )
            .expect(400)
        expect(stock.body.code).toBe('ORDER_ITEMS_INVALID')
        expect(stock.body.details).toEqual([
            { field: 'items.0', errors: ['Solo queda 1 unidad de «Franela».'] },
            { field: 'items.1', errors: ['«Oculto» ya no está disponible.'] },
        ])
        expect(stock.body.lines[0]).toMatchObject({ index: 0, available: 1 })
        expect(db.stock('tee-001')).toBe(1)
        expect(db.table(Order)).toHaveLength(0)
    })

    it('refuses orders without Pago Móvil details or a usable BCV rate', async () => {
        db.table(SiteContentEntry).length = 0
        const noPayment = await request(app.getHttpServer())
            .post('/api/orders')
            .send(checkout())
            .expect(503)
        expect(noPayment.body.code).toBe('PAYMENT_METHOD_UNAVAILABLE')

        db.table(SiteContentEntry).push({ key: 'payment', value: PAGO_MOVIL })
        db.table(ExchangeRate)[0]!.effectiveDate = '2020-01-01'
        const stale = await request(app.getHttpServer())
            .post('/api/orders')
            .send(checkout())
            .expect(503)
        expect(stale.body).toMatchObject({
            code: 'EXCHANGE_RATE_UNAVAILABLE',
            message:
                'No pudimos obtener la tasa del BCV. Intenta más tarde o contáctanos por WhatsApp.',
        })
        const current = await request(app.getHttpServer())
            .get('/api/exchange-rate/current')
            .expect(200)
        expect(current.body).toMatchObject({ available: false, reason: 'stale' })
    })

    it('hides orders behind the token: wrong or missing token is a 404', async () => {
        const { body } = await request(app.getHttpServer())
            .post('/api/orders')
            .send(checkout())
            .expect(201)
        await request(app.getHttpServer()).get(`/api/orders/${body.code}`).expect(404)
        await request(app.getHttpServer())
            .get(`/api/orders/${body.code}?t=${'x'.repeat(43)}`)
            .expect(404)
        await request(app.getHttpServer())
            .get(`/api/orders/MR-999999?t=${body.accessToken}`)
            .expect(404)
    })

    it('runs the payment flow: proof, flags, verification, fulfilment and a 409', async () => {
        const first = (
            await request(app.getHttpServer()).post('/api/orders').send(checkout()).expect(201)
        ).body
        const second = (
            await request(app.getHttpServer()).post('/api/orders').send(checkout()).expect(201)
        ).body

        const submitted = await payment(first.code, first.accessToken, { amountBs: '30.760,69' })
            .attach('proof', PNG, { filename: 'pago.png', contentType: 'image/png' })
            .expect(200)
        expect(submitted.body.status).toBe('PENDIENTE_VERIFICACION')
        expect(storage.uploadPrivate).toHaveBeenCalledTimes(1)

        // Same reference on another order, different amount: accepted but flagged.
        await payment(second.code, second.accessToken, { amountBs: '30000' }).expect(200)
        await payment(second.code, second.accessToken, { amountBs: '30000' }).expect(409)

        const detail = await request(app.getHttpServer())
            .get(`/api/admin/orders/${second.code}`)
            .set('Cookie', cookie('editor'))
            .expect(200)
        expect(detail.body.payments[0]).toMatchObject({
            duplicateReference: true,
            amountMismatch: true,
            amountDifferenceBs: -760.69,
            proofPath: null,
        })
        expect(detail.body.allowedTransitions.map((rule: Row) => rule.to)).toEqual([
            'PAGO_VERIFICADO',
            'PAGO_RECHAZADO',
        ])
        expect(db.table(OrderPayment)[0]?.duplicateReference).toBe(true)

        const transition = (code: string, to: string, user: keyof typeof USERS, note?: string) =>
            request(app.getHttpServer())
                .post(`/api/admin/orders/${code}/transitions`)
                .set('Cookie', cookie(user))
                .send(note ? { to, note } : { to })

        await transition(first.code, 'ENVIADO', 'editor').expect(409)
        await transition(first.code, 'PAGO_VERIFICADO', 'editor').expect(200)
        for (const to of ['EN_PRODUCCION', 'LISTO_PARA_ENTREGA', 'ENVIADO', 'ENTREGADO']) {
            await transition(
                first.code,
                to,
                'editor',
                to === 'ENVIADO' ? 'MRW 123' : undefined,
            ).expect(200)
        }
        const conflict = await transition(first.code, 'EN_PRODUCCION', 'admin').expect(409)
        expect(conflict.body.message).toBe(
            'No se puede pasar un pedido de «Entregado» a «En producción».',
        )

        const publicView = await request(app.getHttpServer())
            .get(`/api/orders/${first.code}?t=${first.accessToken}`)
            .expect(200)
        expect(publicView.body.status).toBe('ENTREGADO')
        expect(publicView.body.history.find((entry: Row) => entry.status === 'ENVIADO').note).toBe(
            'MRW 123',
        )
        expect(publicView.body.payments[0].status).toBe('VERIFICADO')

        const changes = events.filter((event) => event.name === ORDER_EVENTS.statusChanged)
        expect(changes.at(-1)?.payload).toMatchObject({
            from: 'ENVIADO',
            to: 'ENTREGADO',
            actor: 'admin',
        })
        expect(events.filter((event) => event.name === ORDER_EVENTS.paymentSubmitted)).toHaveLength(
            2,
        )
    })

    it('rejects with a reason, lets the customer re-submit, and only ADMIN cancels (restoring stock)', async () => {
        const order = (
            await request(app.getHttpServer()).post('/api/orders').send(checkout()).expect(201)
        ).body
        await payment(order.code, order.accessToken, { amountBs: '30760.69' }).expect(200)

        const post = (path: string, user: keyof typeof USERS, body: Row) =>
            request(app.getHttpServer())
                .post(`/api/admin/orders/${order.code}${path}`)
                .set('Cookie', cookie(user))
                .send(body)

        await post('/transitions', 'editor', { to: 'PAGO_RECHAZADO' }).expect(400)
        await post('/transitions', 'editor', {
            to: 'PAGO_RECHAZADO',
            note: 'No llegó el pago',
        }).expect(200)

        const rejected = await request(app.getHttpServer()).get(
            `/api/orders/${order.code}?t=${order.accessToken}`,
        )
        expect(rejected.body).toMatchObject({ status: 'PAGO_RECHAZADO', canSubmitPayment: true })
        expect(rejected.body.payments[0]).toMatchObject({
            status: 'RECHAZADO',
            rejectionReason: 'No llegó el pago',
        })

        await payment(order.code, order.accessToken, {
            reference: '99887766',
            amountBs: '30760.69',
        }).expect(200)

        await post('/transitions', 'editor', { to: 'CANCELADO', note: 'Cliente desistió' }).expect(
            403,
        )
        expect(db.stock('mug-001')).toBe(3)
        // A payment is waiting: the admin must say whether money has to be given back.
        const noRefundAnswer = await post('/transitions', 'admin', {
            to: 'CANCELADO',
            note: 'Cliente desistió',
        }).expect(400)
        expect(noRefundAnswer.body.details).toEqual([
            { field: 'refundStatus', errors: ['Indica si hay que devolver dinero al cliente.'] },
        ])
        expect(db.stock('mug-001')).toBe(3)
        const cancelled = await post('/transitions', 'admin', {
            to: 'CANCELADO',
            note: 'Cliente desistió',
            refundStatus: 'PENDIENTE',
        }).expect(200)
        expect(cancelled.body.status).toBe('CANCELADO')
        expect(cancelled.body.stockRestored).toBe(true)
        expect(cancelled.body.refund).toMatchObject({ status: 'PENDIENTE', refundedAt: null })
        expect(db.stock('mug-001')).toBe(5)

        const refunded = await post('/refund', 'editor', { reference: '11223344' }).expect(200)
        expect(refunded.body.refund).toMatchObject({
            status: 'REEMBOLSADO',
            reference: '11223344',
        })
        expect(refunded.body.notes[0].body).toBe('Reembolsado (referencia 11223344).')
        await post('/refund', 'editor', {}).expect(409)
        expect(
            events
                .filter((event) => event.name === ORDER_EVENTS.refundUpdated)
                .map((e) => e.payload.refundStatus),
        ).toEqual(['PENDIENTE', 'REEMBOLSADO'])

        // The customer can no longer pay a cancelled order.
        const closed = await payment(order.code, order.accessToken, {
            reference: '55443322',
            amountBs: '30760.69',
        }).expect(409)
        expect(closed.body.message).toBe(
            'Este pedido fue cancelado. Si hiciste un pago, escríbenos por WhatsApp.',
        )

        const noted = await post('/notes', 'editor', { body: 'Llamar mañana' }).expect(200)
        expect(noted.body.notes[0]).toMatchObject({ body: 'Llamar mañana' })
    })

    const createOrder = async (items?: Row[]) =>
        (
            await request(app.getHttpServer())
                .post('/api/orders')
                .send(items ? checkout({ items }) : checkout())
                .expect(201)
        ).body as { code: string; accessToken: string }

    const orderRow = (code: string) => db.table(Order).find((row) => row.code === code) as Row

    /** Deadline two days ago, so a payment dated today is after the deadline's day. */
    const overdue = (code: string) => {
        orderRow(code).paymentDueAt = new Date(Date.now() - 2 * 86_400_000)
    }

    const expire = async (code: string) => {
        overdue(code)
        await app.get(OrderExpiryService).expireOverdue()
        expect(orderRow(code).status).toBe('EXPIRADO')
    }

    const admin = (code: string, path: string, user: keyof typeof USERS, body: Row) =>
        request(app.getHttpServer())
            .post(`/api/admin/orders/${code}${path}`)
            .set('Cookie', cookie(user))
            .send(body)

    it('does not flag a payment made on time whose proof is uploaded after the deadline', async () => {
        const order = await createOrder()
        orderRow(order.code).paymentDueAt = new Date(Date.now() - 60_000)

        await payment(order.code, order.accessToken, {
            amountBs: '30760.69',
            paidOn: caracasDay(orderRow(order.code).paymentDueAt as Date),
        }).expect(200)
        expect(orderRow(order.code)).toMatchObject({
            status: 'PENDIENTE_VERIFICACION',
            latePayment: false,
        })
    })

    it('flags a payment dated after the deadline as late', async () => {
        const order = await createOrder()
        overdue(order.code)
        const page = await request(app.getHttpServer())
            .get(`/api/orders/${order.code}?t=${order.accessToken}`)
            .expect(200)
        expect(page.body.canSubmitPayment).toBe(true)

        await payment(order.code, order.accessToken, { amountBs: '30760.69' }).expect(200)
        const detail = await request(app.getHttpServer())
            .get(`/api/admin/orders/${order.code}`)
            .set('Cookie', cookie('editor'))
            .expect(200)
        expect(detail.body).toMatchObject({
            status: 'PENDIENTE_VERIFICACION',
            latePayment: true,
            stockConflict: null,
        })
        expect(detail.body.payments[0]).toMatchObject({ late: true, source: 'customer' })
        expect(detail.body.history.at(-1).note).toBe(
            'Pago hecho después del plazo, según la fecha indicada.',
        )
        const submitted = events.find((event) => event.name === ORDER_EVENTS.paymentSubmitted)
        expect(submitted?.payload).toMatchObject({
            late: true,
            source: 'customer',
            stockConflict: false,
        })
    })

    it('takes the stock back when an expired order receives its payment', async () => {
        const order = await createOrder()
        expect(db.stock('mug-001')).toBe(3)
        await expire(order.code)
        expect(db.stock('mug-001')).toBe(5)

        const paid = await payment(order.code, order.accessToken, { amountBs: '30760.69' }).expect(
            200,
        )
        expect(paid.body.status).toBe('PENDIENTE_VERIFICACION')
        expect(db.stock('mug-001')).toBe(3)
        expect(orderRow(order.code)).toMatchObject({
            latePayment: true,
            stockRestored: false,
            stockConflict: null,
        })
    })

    it('accepts a late payment without stock, flags the conflict and needs an acknowledgement', async () => {
        const order = await createOrder([{ productId: 'tee-001', variantId: 'v-m', quantity: 1 }])
        await expire(order.code)
        // Sold elsewhere in the meantime.
        db.table(Product).find((row) => row.id === 'tee-001')!.stock = 0

        await payment(order.code, order.accessToken, { amountBs: '1' }).expect(200)
        expect(db.stock('tee-001')).toBe(0)
        const detail = await request(app.getHttpServer())
            .get(`/api/admin/orders/${order.code}`)
            .set('Cookie', cookie('editor'))
            .expect(200)
        expect(detail.body.status).toBe('PENDIENTE_VERIFICACION')
        expect(detail.body.stockConflict).toMatchObject({
            resolvedAt: null,
            lines: [
                {
                    productId: 'tee-001',
                    productName: 'Franela',
                    requested: 1,
                    available: 0,
                    reserved: 0,
                },
            ],
        })
        expect(detail.body.history.at(-1).note).toBe(
            'Pago hecho después del plazo, según la fecha indicada. Stock insuficiente: «Franela» pidió 1, hay 0.',
        )

        const unacknowledged = await admin(order.code, '/transitions', 'editor', {
            to: 'PAGO_VERIFICADO',
        }).expect(400)
        expect(unacknowledged.body.code).toBe('STOCK_CONFLICT_UNACKNOWLEDGED')
        expect(unacknowledged.body.details[0].field).toBe('acknowledgeStockConflict')
        expect(orderRow(order.code).status).toBe('PENDIENTE_VERIFICACION')

        const confirmed = await admin(order.code, '/transitions', 'editor', {
            to: 'PAGO_VERIFICADO',
            acknowledgeStockConflict: true,
        }).expect(200)
        expect(confirmed.body.status).toBe('PAGO_VERIFICADO')
        expect(confirmed.body.stockConflict.resolvedAt).not.toBeNull()
        expect(confirmed.body.history.at(-1).note).toBe(
            'Pago confirmado con stock insuficiente: «Franela» faltan 1 unidad.',
        )
        expect(db.stock('tee-001')).toBe(0)

        // Cancelling gives back only what the order really took (nothing here).
        await admin(order.code, '/transitions', 'admin', {
            to: 'CANCELADO',
            note: 'Sin franelas',
            refundStatus: 'NO_APLICA',
        }).expect(200)
        expect(db.stock('tee-001')).toBe(0)
    })

    it('lets staff record a payment sent by WhatsApp', async () => {
        const order = await createOrder()
        await admin(order.code, '/transitions', 'editor', { to: 'PENDIENTE_VERIFICACION' }).expect(
            409,
        )
        const req = request(app.getHttpServer())
            .post(`/api/admin/orders/${order.code}/payments`)
            .set('Cookie', cookie('editor'))
        for (const [key, value] of Object.entries({
            reference: '77889900',
            payerBankCode: '0134',
            payerPhone: '0414-1234567',
            paidOn: caracasDay(),
            amountBs: '30760,69',
        })) {
            req.field(key, value)
        }
        const recorded = await req
            .attach('proof', PNG, { filename: 'pago.png', contentType: 'image/png' })
            .expect(200)
        expect(recorded.body.status).toBe('PENDIENTE_VERIFICACION')
        expect(recorded.body.payments[0]).toMatchObject({
            source: 'admin',
            late: false,
            reference: '77889900',
        })
        expect(db.table(OrderPayment)[0]).toMatchObject({
            source: 'admin',
            recordedById: 'editor-1',
        })
        expect(recorded.body.history.at(-1)).toMatchObject({
            actor: 'admin',
            note: 'Pago registrado por la administración (comprobante recibido por WhatsApp).',
        })
        await request(app.getHttpServer())
            .post(`/api/admin/orders/${order.code}/payments`)
            .expect(401)
    })

    it('reactivates an expired order, refusing (or forcing) when stock is missing', async () => {
        const order = await createOrder([{ productId: 'tee-001', variantId: 'v-m', quantity: 1 }])
        await expire(order.code)
        db.table(Product).find((row) => row.id === 'tee-001')!.stock = 0

        const refused = await admin(order.code, '/transitions', 'editor', {
            to: 'PENDIENTE_PAGO',
        }).expect(409)
        expect(refused.body).toMatchObject({
            code: 'STOCK_INSUFFICIENT',
            message: 'No hay stock suficiente para reactivar el pedido: «Franela» pidió 1, hay 0.',
        })
        expect(orderRow(order.code).status).toBe('EXPIRADO')

        const forced = await admin(order.code, '/transitions', 'editor', {
            to: 'PENDIENTE_PAGO',
            forceStock: true,
        }).expect(200)
        expect(forced.body.status).toBe('PENDIENTE_PAGO')
        expect(new Date(forced.body.paymentDueAt).getTime()).toBeGreaterThan(Date.now())
        expect(forced.body.stockConflict.lines[0]).toMatchObject({ requested: 1, available: 0 })
        expect(forced.body.history.at(-1).note).toBe(
            'Pedido reactivado con un nuevo plazo de pago. Stock insuficiente: «Franela» pidió 1, hay 0.',
        )
        expect(db.stock('tee-001')).toBe(0)

        const withStock = await createOrder()
        await expire(withStock.code)
        const reactivated = await admin(withStock.code, '/transitions', 'admin', {
            to: 'PENDIENTE_PAGO',
        }).expect(200)
        expect(reactivated.body).toMatchObject({ status: 'PENDIENTE_PAGO', stockConflict: null })
        expect(db.stock('mug-001')).toBe(3)
    })

    it('reactivates a cancelled order only for ADMIN and only if never paid', async () => {
        const order = await createOrder()
        await admin(order.code, '/transitions', 'admin', {
            to: 'CANCELADO',
            note: 'Duplicado',
        }).expect(200)
        expect(db.stock('mug-001')).toBe(5)
        await admin(order.code, '/transitions', 'editor', { to: 'PENDIENTE_PAGO' }).expect(403)
        const detail = await admin(order.code, '/transitions', 'admin', {
            to: 'PENDIENTE_PAGO',
        }).expect(200)
        expect(detail.body.status).toBe('PENDIENTE_PAGO')
        expect(db.stock('mug-001')).toBe(3)

        const paid = await createOrder()
        await payment(paid.code, paid.accessToken, { amountBs: '30760.69' }).expect(200)
        await admin(paid.code, '/transitions', 'editor', { to: 'PAGO_VERIFICADO' }).expect(200)
        const cancelled = await admin(paid.code, '/transitions', 'admin', {
            to: 'CANCELADO',
            note: 'Cliente desistió',
            refundStatus: 'REEMBOLSADO',
            refundReference: '998877',
        }).expect(200)
        expect(cancelled.body.refund).toMatchObject({ status: 'REEMBOLSADO', reference: '998877' })
        expect(cancelled.body.allowedTransitions).toEqual([])
        const again = await admin(paid.code, '/transitions', 'admin', {
            to: 'PENDIENTE_PAGO',
        }).expect(409)
        expect(again.body.message).toBe(
            'Este pedido tuvo un pago verificado, así que no se puede reactivar.',
        )
    })

    it('stores a trimmed personalization per item, up to 140 characters', async () => {
        const created = await request(app.getHttpServer())
            .post('/api/orders')
            .send(
                checkout({
                    items: [
                        {
                            productId: 'mug-001',
                            variantId: 'v-11oz',
                            quantity: 1,
                            personalization: '  Feliz cumple, Ana  ',
                        },
                        {
                            productId: 'mug-001',
                            variantId: 'v-11oz',
                            quantity: 1,
                            personalization: 'Luis',
                        },
                        { productId: 'mug-001', variantId: 'v-11oz', quantity: 1 },
                    ],
                }),
            )
            .expect(201)
        expect(created.body.order.items.map((item: Row) => item.personalization)).toEqual([
            'Feliz cumple, Ana',
            'Luis',
            null,
        ])
        const tooLong = await request(app.getHttpServer())
            .post('/api/orders')
            .send(
                checkout({
                    items: [
                        {
                            productId: 'mug-001',
                            variantId: 'v-11oz',
                            quantity: 1,
                            personalization: 'x'.repeat(141),
                        },
                    ],
                }),
            )
            .expect(400)
        expect(tooLong.body.details).toEqual([
            {
                field: 'items.0.personalization',
                errors: ['El texto personalizado no puede superar los 140 caracteres.'],
            },
        ])
    })

    it('validates the payment form and the proof type', async () => {
        const order = (
            await request(app.getHttpServer()).post('/api/orders').send(checkout()).expect(201)
        ).body
        const invalid = await payment(order.code, order.accessToken, {
            reference: '12',
            payerBankCode: 'abc',
            payerPhone: '12345',
            amountBs: 'mucho',
        }).expect(400)
        expect(invalid.body.details.map((detail: Row) => detail.field).sort()).toEqual([
            'amountBs',
            'payerBankCode',
            'payerPhone',
            'reference',
        ])

        // Four digits, but not an active bank of the catalog: unknown, or deactivated (0104).
        for (const payerBankCode of ['9999', '0104']) {
            const bank = await payment(order.code, order.accessToken, {
                payerBankCode,
                amountBs: '1',
            }).expect(400)
            expect(bank.body.details).toEqual([
                { field: 'payerBankCode', errors: ['Elige el banco desde el que pagaste.'] },
            ])
        }
        expect(db.table(OrderPayment)).toHaveLength(0)

        const future = await payment(order.code, order.accessToken, {
            paidOn: '2999-01-01',
            amountBs: '1',
        }).expect(400)
        expect(future.body.details).toEqual([
            { field: 'paidOn', errors: ['La fecha del pago no puede estar en el futuro.'] },
        ])

        const fake = await payment(order.code, order.accessToken, { amountBs: '1' })
            .attach('proof', Buffer.from('<svg/>'), { filename: 'x.png', contentType: 'image/png' })
            .expect(400)
        expect(fake.body.details).toEqual([
            { field: 'proof', errors: ['La captura debe ser una imagen JPG, PNG o WEBP.'] },
        ])
        expect(storage.uploadPrivate).not.toHaveBeenCalled()
    })

    it('takes only mobiles on an active operator code at checkout', async () => {
        const post = (phone: string) =>
            request(app.getHttpServer()).post('/api/orders').send(checkout({ phone }))

        for (const phone of ['0212-5551234', '+58 414 1234567', '04141234567', '0414-123456']) {
            const invalid = await post(phone).expect(400)
            expect(invalid.body.details).toEqual([
                {
                    field: 'phone',
                    errors: ['Escribe un celular válido, por ejemplo 0412-5550134.'],
                },
            ])
        }
        // 0426 exists in the catalog but is inactive; 0413 is not a code at all.
        for (const code of ['0426', '0413']) {
            const inactive = await post(`${code}-1234567`).expect(400)
            expect(inactive.body.details).toEqual([
                { field: 'phone', errors: [`El código ${code} no está disponible.`] },
            ])
        }
        expect(db.table(Order)).toHaveLength(0)
        await post('0424-1234567').expect(201)
    })

    it('checks the payer phone code and the cédula or RIF of the payment (customer and staff)', async () => {
        const order = await createOrder()
        const inactive = await payment(order.code, order.accessToken, {
            payerPhone: '0426-1234567',
            amountBs: '1',
        }).expect(400)
        expect(inactive.body.details).toEqual([
            { field: 'payerPhone', errors: ['El código 0426 no está disponible.'] },
        ])

        const idMessage = 'Usa V, J o G seguido de 6 a 9 números, por ejemplo V-12345678.'
        for (const payerIdNumber of ['E-12345678', 'P-1234567', 'V-12345', 'V-1234567890']) {
            const invalid = await payment(order.code, order.accessToken, {
                payerIdNumber,
                amountBs: '1',
            }).expect(400)
            expect(invalid.body.details).toEqual([{ field: 'payerIdNumber', errors: [idMessage] }])
        }
        expect(db.table(OrderPayment)).toHaveLength(0)

        const staff = (payerIdNumber: string) => {
            const req = request(app.getHttpServer())
                .post(`/api/admin/orders/${order.code}/payments`)
                .set('Cookie', cookie('editor'))
            for (const [key, value] of Object.entries({
                reference: '77889900',
                payerBankCode: '0134',
                payerPhone: '0424-1234567',
                payerIdNumber,
                paidOn: caracasDay(),
                amountBs: '30760,69',
            })) {
                req.field(key, value)
            }
            return req
        }
        const staffInvalid = await staff('E-12345678').expect(400)
        expect(staffInvalid.body.details).toEqual([{ field: 'payerIdNumber', errors: [idMessage] }])

        // Lowercase is uppercased; an empty cédula is simply not sent.
        await payment(order.code, order.accessToken, {
            payerIdNumber: 'v-12345678',
            amountBs: '1',
        }).expect(200)
        expect(db.table(OrderPayment)[0]).toMatchObject({ payerIdNumber: 'V-12345678' })

        await admin(order.code, '/transitions', 'admin', {
            to: 'PAGO_RECHAZADO',
            note: 'Monto incompleto',
        }).expect(200)
        await staff('J-123456789').expect(200)
        expect(db.table(OrderPayment)[1]).toMatchObject({ payerIdNumber: 'J-123456789' })
    })

    it('filters the admin list by one or several statuses', async () => {
        for (let index = 0; index < 3; index += 1) {
            await request(app.getHttpServer())
                .post('/api/orders')
                .send(
                    checkout({
                        items: [{ productId: 'mug-001', variantId: 'v-11oz', quantity: 1 }],
                    }),
                )
                .expect(201)
        }
        const [first, second, third] = db.table(Order)
        Object.assign(first as Row, { status: 'PENDIENTE_VERIFICACION' })
        Object.assign(second as Row, { status: 'PAGO_RECHAZADO' })
        Object.assign(third as Row, { status: 'PENDIENTE_PAGO' })

        const list = (query: string) =>
            request(app.getHttpServer())
                .get(`/api/admin/orders${query}`)
                .set('Cookie', cookie('editor'))
        const codes = (body: { items: { code: string }[] }) => body.items.map((row) => row.code)

        const single = (await list('?status=PENDIENTE_VERIFICACION').expect(200)).body
        expect(codes(single)).toEqual([first?.code])
        expect(single.total).toBe(1)
        // The counts ignore the status filter, so every tab can show its number.
        expect(single.countAll).toBe(3)
        expect(single.counts).toMatchObject({
            PENDIENTE_VERIFICACION: 1,
            PAGO_RECHAZADO: 1,
            PENDIENTE_PAGO: 1,
            ENTREGADO: 0,
        })

        const csv = (await list('?status=PENDIENTE_PAGO,PAGO_RECHAZADO').expect(200)).body
        expect(codes(csv)).toEqual([third?.code, second?.code])
        const repeated = (await list('?status=PENDIENTE_PAGO&status=PAGO_RECHAZADO').expect(200))
            .body
        expect(codes(repeated)).toEqual(codes(csv))
        expect((await list('').expect(200)).body.total).toBe(3)

        const invalid = await list('?status=PENDIENTE_PAGO,PAGADO').expect(400)
        expect(invalid.body.details).toEqual([
            {
                field: 'status',
                errors: [expect.stringMatching(/^El estado no es válido\. Usa uno o varios de /)],
            },
        ])
    })

    it('keeps the admin API behind a session', async () => {
        await request(app.getHttpServer()).get('/api/admin/orders/MR-000001').expect(401)
        await request(app.getHttpServer())
            .get('/api/admin/orders/MR-000001/payments/p/proof')
            .expect(401)
        await request(app.getHttpServer())
            .post('/api/admin/exchange-rate/manual')
            .send({ rate: 1 })
            .expect(401)
        await request(app.getHttpServer())
            .post('/api/admin/exchange-rate/manual')
            .set('Cookie', cookie('editor'))
            .send({ rate: 1 })
            .expect(403)
        expect(DEFAULT_SITE_CONTENT.payment.bankCode).toBe('')
    })
})
