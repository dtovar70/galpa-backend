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
import { ProductVariant } from '../src/products/entities/product-variant.entity.js'
import { STORAGE_SERVICE, type StorageService } from '../src/storage/storage.service.js'

import { FakeDb, PAYMENT, PNG, USERS, type Row } from './fixtures/fake-orders-db.js'

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
        paymentMethod: 'PAGO_MOVIL',
        items: [{ productId: 'split-001', variantId: 'v-220v', quantity: 2 }],
        ...overrides,
    })

    const payment = (code: string, token: string, fields: Row = {}) => {
        const req = request(app.getHttpServer()).post(`/api/orders/${code}/payment?t=${token}`)
        const values: Row = {
            method: 'PAGO_MOVIL',
            reference: '123456',
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
            `galpa_session=${signer.sign({ sub: USERS[user].id, role: USERS[user].role }, { expiresIn: 600 })}`
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
        expect(code).toBe('GP-000001')
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
            productName: 'Split Inverter 12.000 BTU',
            variantLabel: '220V',
            unitPriceUsd: 16,
            quantity: 2,
            imageUrl: 'http://img/split.jpg',
            brand: 'LG',
            model: 'S4-Q12JA',
            stockMode: 'STOCK',
        })
        expect(order.status).toBe('PENDIENTE_PAGO')
        expect(order).toMatchObject({
            paymentMethod: 'PAGO_MOVIL',
            paymentMethodLabel: 'Pago Móvil',
            amountDue: { currency: 'VES', amount: 30760.69 },
            hasOnOrderItems: false,
            wantsInstallation: false,
            canChangePaymentMethod: true,
            availablePaymentMethods: ['PAGO_MOVIL', 'ZELLE'],
        })
        expect((order.payment as Row).pagoMovil).toEqual(PAYMENT.pagoMovil)
        // Methods that are not offered never show their details.
        expect((order.payment as Row).transfer).toEqual(DEFAULT_SITE_CONTENT.payment.transfer)
        // Only the ordered variant loses units; the product total follows.
        expect(db.variantStock('v-220v')).toBe(3)
        expect(db.variantStock('v-110v')).toBe(3)
        expect(db.stock('split-001')).toBe(6)
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
                        {
                            productId: 'split-001',
                            variantId: 'v-110v',
                            quantity: 1,
                            unitPrice: 0.01,
                        },
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
                        { productId: 'cap-001', variantId: 'v-35uf', quantity: 2 },
                        { productId: 'off-001', quantity: 1 },
                    ],
                }),
            )
            .expect(400)
        expect(stock.body.code).toBe('ORDER_ITEMS_INVALID')
        expect(stock.body.details).toEqual([
            { field: 'items.0', errors: ['Solo queda 1 unidad de «Capacitor dual – 35+5 µF».'] },
            { field: 'items.1', errors: ['«Oculto» ya no está disponible.'] },
        ])
        expect(stock.body.lines[0]).toMatchObject({ index: 0, available: 1 })
        expect(db.stock('cap-001')).toBe(1)
        expect(db.table(Order)).toHaveLength(0)
    })

    it('refuses a method the store does not offer, and orders without any method or BCV rate', async () => {
        const binance = await request(app.getHttpServer())
            .post('/api/orders')
            .send(checkout({ paymentMethod: 'BINANCE' }))
            .expect(400)
        expect(binance.body.details).toEqual([
            {
                field: 'paymentMethod',
                errors: ['Este método de pago no está disponible. Elige otro.'],
            },
        ])

        db.table(SiteContentEntry).length = 0
        const noPayment = await request(app.getHttpServer())
            .post('/api/orders')
            .send(checkout())
            .expect(503)
        expect(noPayment.body.code).toBe('PAYMENT_METHOD_UNAVAILABLE')

        db.table(SiteContentEntry).push({ key: 'payment', value: PAYMENT })
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
            .get(`/api/orders/GP-999999?t=${body.accessToken}`)
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

        // Same method and reference on another order, different amount: accepted but flagged.
        await payment(second.code, second.accessToken, { amountBs: '30000' }).expect(200)
        await payment(second.code, second.accessToken, { amountBs: '30000' }).expect(409)

        const detail = await request(app.getHttpServer())
            .get(`/api/admin/orders/${second.code}`)
            .set('Cookie', cookie('editor'))
            .expect(200)
        expect(detail.body.payments[0]).toMatchObject({
            method: 'PAGO_MOVIL',
            methodLabel: 'Pago Móvil',
            duplicateReference: true,
            currency: 'VES',
            amountMismatch: true,
            amountDifference: -760.69,
            amountUsd: null,
            expectedUsd: null,
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

        await transition(first.code, 'DESPACHADO', 'editor').expect(409)
        await transition(first.code, 'PAGO_VERIFICADO', 'editor').expect(200)
        for (const to of ['EN_PREPARACION', 'DESPACHADO', 'ENTREGADO']) {
            await transition(
                first.code,
                to,
                'editor',
                to === 'DESPACHADO' ? 'MRW 123' : undefined,
            ).expect(200)
        }
        const conflict = await transition(first.code, 'EN_PREPARACION', 'admin').expect(409)
        expect(conflict.body.message).toBe(
            'No se puede pasar un pedido de «Entregado» a «Preparando despacho».',
        )

        const publicView = await request(app.getHttpServer())
            .get(`/api/orders/${first.code}?t=${first.accessToken}`)
            .expect(200)
        expect(publicView.body.status).toBe('ENTREGADO')
        expect(
            publicView.body.history.find((entry: Row) => entry.status === 'DESPACHADO').note,
        ).toBe('MRW 123')
        expect(publicView.body.payments[0].status).toBe('VERIFICADO')

        const changes = events.filter((event) => event.name === ORDER_EVENTS.statusChanged)
        expect(changes.at(-1)?.payload).toMatchObject({
            from: 'DESPACHADO',
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
            reference: '887766',
            amountBs: '30760.69',
        }).expect(200)
        // A payment under verification is approved or rejected first, never cancelled.
        await post('/transitions', 'admin', { to: 'CANCELADO', note: 'Cliente desistió' }).expect(
            409,
        )
        await post('/transitions', 'editor', { to: 'PAGO_VERIFICADO' }).expect(200)

        await post('/transitions', 'editor', { to: 'CANCELADO', note: 'Cliente desistió' }).expect(
            403,
        )
        expect(db.variantStock('v-220v')).toBe(3)
        // A payment is waiting: the admin must say whether money has to be given back.
        const noRefundAnswer = await post('/transitions', 'admin', {
            to: 'CANCELADO',
            note: 'Cliente desistió',
        }).expect(400)
        expect(noRefundAnswer.body.details).toEqual([
            { field: 'refundStatus', errors: ['Indica si hay que devolver dinero al cliente.'] },
        ])
        expect(db.variantStock('v-220v')).toBe(3)
        const cancelled = await post('/transitions', 'admin', {
            to: 'CANCELADO',
            note: 'Cliente desistió',
            refundStatus: 'PENDIENTE',
        }).expect(200)
        expect(cancelled.body.status).toBe('CANCELADO')
        expect(cancelled.body.stockRestored).toBe(true)
        expect(cancelled.body.refund).toMatchObject({ status: 'PENDIENTE', refundedAt: null })
        expect(db.variantStock('v-220v')).toBe(5)

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
            reference: '443322',
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
        expect(db.variantStock('v-220v')).toBe(3)
        await expire(order.code)
        expect(db.variantStock('v-220v')).toBe(5)

        const paid = await payment(order.code, order.accessToken, { amountBs: '30760.69' }).expect(
            200,
        )
        expect(paid.body.status).toBe('PENDIENTE_VERIFICACION')
        expect(db.variantStock('v-220v')).toBe(3)
        expect(orderRow(order.code)).toMatchObject({
            latePayment: true,
            stockRestored: false,
            stockConflict: null,
        })
    })

    it('accepts a late payment without stock, flags the conflict and needs an acknowledgement', async () => {
        const order = await createOrder([
            { productId: 'cap-001', variantId: 'v-35uf', quantity: 1 },
        ])
        await expire(order.code)
        // Sold elsewhere in the meantime.
        db.setVariantStock('v-35uf', 0)

        await payment(order.code, order.accessToken, { amountBs: '1' }).expect(200)
        expect(db.stock('cap-001')).toBe(0)
        const detail = await request(app.getHttpServer())
            .get(`/api/admin/orders/${order.code}`)
            .set('Cookie', cookie('editor'))
            .expect(200)
        expect(detail.body.status).toBe('PENDIENTE_VERIFICACION')
        expect(detail.body.stockConflict).toMatchObject({
            resolvedAt: null,
            lines: [
                {
                    productId: 'cap-001',
                    variantId: 'v-35uf',
                    productName: 'Capacitor dual',
                    variantLabel: '35+5 µF',
                    requested: 1,
                    available: 0,
                    reserved: 0,
                },
            ],
        })
        expect(detail.body.history.at(-1).note).toBe(
            'Pago hecho después del plazo, según la fecha indicada. Stock insuficiente: «Capacitor dual – 35+5 µF» pidió 1, hay 0.',
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
            'Pago confirmado con stock insuficiente: «Capacitor dual – 35+5 µF» faltan 1 unidad.',
        )
        expect(db.stock('cap-001')).toBe(0)

        // Cancelling gives back only what the order really took (nothing here).
        await admin(order.code, '/transitions', 'admin', {
            to: 'CANCELADO',
            note: 'Sin capacitores',
            refundStatus: 'NO_APLICA',
        }).expect(200)
        expect(db.stock('cap-001')).toBe(0)
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
            method: 'PAGO_MOVIL',
            reference: '889900',
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
            reference: '889900',
        })
        expect(db.table(OrderPayment)[0]).toMatchObject({
            source: 'admin',
            recordedById: 'editor-1',
        })
        expect(recorded.body.history.at(-1)).toMatchObject({
            actor: 'admin',
            note: 'Pago por Pago Móvil registrado por la administración (comprobante recibido por WhatsApp).',
        })
        await request(app.getHttpServer())
            .post(`/api/admin/orders/${order.code}/payments`)
            .expect(401)
    })

    it('reactivates an expired order, refusing (or forcing) when stock is missing', async () => {
        const order = await createOrder([
            { productId: 'cap-001', variantId: 'v-35uf', quantity: 1 },
        ])
        await expire(order.code)
        db.setVariantStock('v-35uf', 0)

        const refused = await admin(order.code, '/transitions', 'editor', {
            to: 'PENDIENTE_PAGO',
        }).expect(409)
        expect(refused.body).toMatchObject({
            code: 'STOCK_INSUFFICIENT',
            message:
                'No hay stock suficiente para reactivar el pedido: «Capacitor dual – 35+5 µF» pidió 1, hay 0.',
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
            'Pedido reactivado con un nuevo plazo de pago. Stock insuficiente: «Capacitor dual – 35+5 µF» pidió 1, hay 0.',
        )
        expect(db.stock('cap-001')).toBe(0)

        const withStock = await createOrder()
        await expire(withStock.code)
        const reactivated = await admin(withStock.code, '/transitions', 'admin', {
            to: 'PENDIENTE_PAGO',
        }).expect(200)
        expect(reactivated.body).toMatchObject({ status: 'PENDIENTE_PAGO', stockConflict: null })
        expect(db.variantStock('v-220v')).toBe(3)
    })

    describe('stock per variant', () => {
        const SPLIT = 'Split Inverter 12.000 BTU'

        it('adds up the lines of one variant and names it when it is short', async () => {
            const short = await request(app.getHttpServer())
                .post('/api/orders')
                .send(
                    checkout({
                        items: [
                            { productId: 'split-001', variantId: 'v-220v', quantity: 3 },
                            { productId: 'split-001', variantId: 'v-110v', quantity: 3 },
                            { productId: 'split-001', variantId: 'v-220v', quantity: 3 },
                        ],
                    }),
                )
                .expect(400)
            // 5 units of 220V: the first line keeps 3, the third can keep 2; 110V is fine.
            expect(short.body.details).toEqual([
                { field: 'items.2', errors: [`Solo quedan 5 unidades de «${SPLIT} – 220V».`] },
            ])
            expect(short.body.lines).toEqual([
                expect.objectContaining({ index: 2, variantId: 'v-220v', available: 2 }),
            ])
            expect(db.variantStock('v-220v')).toBe(5)

            await createOrder([
                { productId: 'split-001', variantId: 'v-220v', quantity: 2 },
                { productId: 'split-001', variantId: 'v-110v', quantity: 1 },
                { productId: 'split-001', variantId: 'v-220v', quantity: 2 },
            ])
            expect(db.variantStock('v-220v')).toBe(1)
            expect(db.variantStock('v-110v')).toBe(2)
            expect(db.stock('split-001')).toBe(3)
        })

        it('refuses a sold-out variant while the other one still sells', async () => {
            db.setVariantStock('v-220v', 0)
            expect(db.stock('split-001')).toBe(3)

            const soldOut = await request(app.getHttpServer())
                .post('/api/orders')
                .send(checkout())
                .expect(400)
            expect(soldOut.body.details).toEqual([
                { field: 'items.0', errors: [`«${SPLIT} – 220V» se agotó.`] },
            ])
            expect(soldOut.body.lines[0]).toMatchObject({ index: 0, available: 0 })

            await createOrder([{ productId: 'split-001', variantId: 'v-110v', quantity: 3 }])
            expect(db.variantStock('v-110v')).toBe(0)
            expect(db.stock('split-001')).toBe(0)
        })

        it('gives each variant back its own units when the order expires', async () => {
            const order = await createOrder([
                { productId: 'split-001', variantId: 'v-110v', quantity: 1 },
                { productId: 'split-001', variantId: 'v-220v', quantity: 2 },
            ])
            expect([db.variantStock('v-110v'), db.variantStock('v-220v')]).toEqual([2, 3])
            await expire(order.code)
            expect([db.variantStock('v-110v'), db.variantStock('v-220v')]).toEqual([3, 5])
            expect(db.stock('split-001')).toBe(8)
        })

        it('keeps the stock of a product without variants on the product', async () => {
            const order = await createOrder([{ productId: 'remote-001', quantity: 2 }])
            expect(db.stock('remote-001')).toBe(1)

            const short = await request(app.getHttpServer())
                .post('/api/orders')
                .send(checkout({ items: [{ productId: 'remote-001', quantity: 2 }] }))
                .expect(400)
            expect(short.body.details).toEqual([
                { field: 'items.0', errors: ['Solo queda 1 unidad de «Control remoto».'] },
            ])

            await admin(order.code, '/transitions', 'admin', {
                to: 'CANCELADO',
                note: 'Duplicado',
            }).expect(200)
            expect(db.stock('remote-001')).toBe(3)
        })

        it('restores nothing for a deleted variant and flags it when taken again', async () => {
            const order = await createOrder([
                { productId: 'split-001', variantId: 'v-220v', quantity: 2 },
                { productId: 'split-001', variantId: 'v-110v', quantity: 1 },
            ])
            // The owner removed the 220V version (its 3 remaining units go with it).
            const variants = db.table(ProductVariant)
            variants.splice(
                variants.findIndex((row) => row.id === 'v-220v'),
                1,
            )

            await expire(order.code)
            expect(orderRow(order.code).stockRestored).toBe(true)
            expect(db.variantStock('v-110v')).toBe(3)

            const refused = await admin(order.code, '/transitions', 'admin', {
                to: 'PENDIENTE_PAGO',
            }).expect(409)
            expect(refused.body.message).toBe(
                `No hay stock suficiente para reactivar el pedido: «${SPLIT} – 220V» pidió 2, hay 0.`,
            )

            const forced = await admin(order.code, '/transitions', 'admin', {
                to: 'PENDIENTE_PAGO',
                forceStock: true,
            }).expect(200)
            expect(forced.body.stockConflict.lines).toEqual([
                {
                    productId: 'split-001',
                    variantId: 'v-220v',
                    productName: SPLIT,
                    variantLabel: '220V',
                    requested: 2,
                    available: 0,
                    reserved: 0,
                    stillShort: true,
                },
            ])
            // The variant that still exists was taken again.
            expect(db.variantStock('v-110v')).toBe(2)
        })

        it('takes a conflict line from its variant once the owner restocks it', async () => {
            const order = await createOrder([
                { productId: 'cap-001', variantId: 'v-35uf', quantity: 1 },
            ])
            await expire(order.code)
            db.setVariantStock('v-35uf', 0)
            await payment(order.code, order.accessToken, { amountBs: '1' }).expect(200)

            db.setVariantStock('v-35uf', 4)
            const confirmed = await admin(order.code, '/transitions', 'editor', {
                to: 'PAGO_VERIFICADO',
                acknowledgeStockConflict: true,
            }).expect(200)
            expect(confirmed.body.stockConflict.lines[0]).toMatchObject({
                variantId: 'v-35uf',
                reserved: 1,
            })
            expect(db.variantStock('v-35uf')).toBe(3)
            expect(db.stock('cap-001')).toBe(3)

            // Cancelling after the conflict gives back only what was taken.
            await admin(order.code, '/transitions', 'admin', {
                to: 'CANCELADO',
                note: 'Sin capacitores',
                refundStatus: 'NO_APLICA',
            }).expect(200)
            expect(db.variantStock('v-35uf')).toBe(4)
        })

        it('confirms without acknowledgement once the owner restocked the variant', async () => {
            const order = await createOrder([
                { productId: 'cap-001', variantId: 'v-35uf', quantity: 1 },
            ])
            await expire(order.code)
            db.setVariantStock('v-35uf', 0)
            await payment(order.code, order.accessToken, { amountBs: '1' }).expect(200)

            db.setVariantStock('v-35uf', 2)
            const detail = await request(app.getHttpServer())
                .get(`/api/admin/orders/${order.code}`)
                .set('Cookie', cookie('editor'))
                .expect(200)
            expect(detail.body.stockConflict).toMatchObject({
                resolvedAt: null,
                stillShort: false,
                lines: [{ variantId: 'v-35uf', requested: 1, reserved: 0, available: 2 }],
            })
            const list = await request(app.getHttpServer())
                .get('/api/admin/orders')
                .set('Cookie', cookie('editor'))
                .expect(200)
            const row = (list.body.items as Row[]).find((item) => item.code === order.code)
            expect(row?.stockConflict).toBe(false)

            const confirmed = await admin(order.code, '/transitions', 'editor', {
                to: 'PAGO_VERIFICADO',
            }).expect(200)
            expect(confirmed.body.status).toBe('PAGO_VERIFICADO')
            expect(confirmed.body.stockConflict.resolvedAt).not.toBeNull()
            expect(confirmed.body.stockConflict.resolvedById).toBe(USERS.editor.id)
            expect(confirmed.body.stockConflict.lines[0]).toMatchObject({ reserved: 1 })
            expect(confirmed.body.history.at(-1).note).toBe(
                'Pago confirmado; el stock que faltaba ya estaba disponible.',
            )
            expect(db.variantStock('v-35uf')).toBe(1)
            expect(db.stock('cap-001')).toBe(1)
        })

        it('still needs the acknowledgement after a partial restock, with the current numbers', async () => {
            db.setVariantStock('v-35uf', 2)
            const order = await createOrder([
                { productId: 'cap-001', variantId: 'v-35uf', quantity: 2 },
            ])
            await expire(order.code)
            db.setVariantStock('v-35uf', 0)
            await payment(order.code, order.accessToken, { amountBs: '1' }).expect(200)

            db.setVariantStock('v-35uf', 1)
            const detail = await request(app.getHttpServer())
                .get(`/api/admin/orders/${order.code}`)
                .set('Cookie', cookie('editor'))
                .expect(200)
            expect(detail.body.stockConflict).toMatchObject({
                stillShort: true,
                lines: [{ requested: 2, reserved: 0, available: 1, stillShort: true }],
            })

            const refused = await admin(order.code, '/transitions', 'editor', {
                to: 'PAGO_VERIFICADO',
            }).expect(400)
            expect(refused.body.code).toBe('STOCK_CONFLICT_UNACKNOWLEDGED')
            expect(refused.body.message).toBe(
                'Falta stock para este pedido («Capacitor dual – 35+5 µF» pidió 2, hay 1). Confirma que lo entiendes para continuar.',
            )
            expect(refused.body.lines).toMatchObject([{ variantId: 'v-35uf', available: 1 }])
            expect(db.variantStock('v-35uf')).toBe(1)

            const confirmed = await admin(order.code, '/transitions', 'editor', {
                to: 'PAGO_VERIFICADO',
                acknowledgeStockConflict: true,
            }).expect(200)
            expect(confirmed.body.stockConflict.lines[0]).toMatchObject({
                requested: 2,
                reserved: 1,
            })
            expect(confirmed.body.history.at(-1).note).toBe(
                'Pago confirmado con stock insuficiente: «Capacitor dual – 35+5 µF» faltan 1 unidad.',
            )
            expect(db.variantStock('v-35uf')).toBe(0)
        })

        it('caps a legacy conflict line (no variantId) over all the variants of its product', async () => {
            const order = await createOrder([
                { productId: 'split-001', variantId: 'v-220v', quantity: 2 },
                { productId: 'split-001', variantId: 'v-110v', quantity: 1 },
            ])
            orderRow(order.code).stockConflict = {
                detectedAt: new Date().toISOString(),
                lines: [
                    {
                        productId: 'split-001',
                        productName: SPLIT,
                        requested: 3,
                        available: 1,
                        reserved: 1,
                    },
                ],
                resolvedAt: null,
                resolvedById: null,
            }
            await admin(order.code, '/transitions', 'admin', {
                to: 'CANCELADO',
                note: 'Duplicado',
            }).expect(200)
            // Only 1 unit was held: it goes back to the first line's variant.
            expect([db.variantStock('v-220v'), db.variantStock('v-110v')]).toEqual([4, 2])
        })
    })

    it('keeps a cancelled order closed, even for ADMIN', async () => {
        const order = await createOrder()
        await admin(order.code, '/transitions', 'admin', {
            to: 'CANCELADO',
            note: 'Duplicado',
        }).expect(200)
        expect(db.variantStock('v-220v')).toBe(5)
        const again = await admin(order.code, '/transitions', 'admin', {
            to: 'PENDIENTE_PAGO',
        }).expect(409)
        expect(again.body.message).toBe(
            'No se puede pasar un pedido de «Cancelado» a «Pendiente de pago».',
        )
        expect(db.variantStock('v-220v')).toBe(5)
    })

    it('sells "bajo pedido" without touching stock and waits for the goods after paying', async () => {
        const created = await request(app.getHttpServer())
            .post('/api/orders')
            .send(
                checkout({
                    items: [
                        { productId: 'cassette-001', quantity: 3 },
                        { productId: 'remote-001', quantity: 1 },
                    ],
                    wantsInstallation: true,
                    customerIdNumber: 'j-123456789',
                }),
            )
            .expect(201)
        const order = created.body as { code: string; accessToken: string; order: Row }
        expect(order.order).toMatchObject({
            hasOnOrderItems: true,
            wantsInstallation: true,
            customer: { idNumber: 'J-123456789' },
        })
        expect((order.order.items as Row[]).map((item) => item.stockMode)).toEqual([
            'ON_ORDER',
            'STOCK',
        ])
        // Only the STOCK line took units.
        expect(db.stock('cassette-001')).toBe(0)
        expect(db.stock('remote-001')).toBe(2)

        await payment(order.code, order.accessToken, { amountBs: '1' }).expect(200)
        await admin(order.code, '/transitions', 'editor', { to: 'PAGO_VERIFICADO' }).expect(200)
        const waiting = await admin(order.code, '/transitions', 'editor', {
            to: 'ESPERANDO_MERCANCIA',
        }).expect(200)
        expect(waiting.body.allowedTransitions.map((rule: Row) => rule.to)).toEqual([
            'EN_PREPARACION',
        ])
        await admin(order.code, '/transitions', 'admin', {
            to: 'CANCELADO',
            note: 'El proveedor no tiene el equipo',
            refundStatus: 'PENDIENTE',
        }).expect(200)
        // The cancellation gives back the STOCK line only.
        expect(db.stock('remote-001')).toBe(3)
        expect(db.stock('cassette-001')).toBe(0)
    })

    it('lets the customer switch to another offered method while the payment is due', async () => {
        const order = await createOrder()
        const path = `/api/orders/${order.code}/payment-method?t=${order.accessToken}`
        const switched = await request(app.getHttpServer())
            .patch(path)
            .send({ method: 'ZELLE' })
            .expect(200)
        expect(switched.body).toMatchObject({
            paymentMethod: 'ZELLE',
            amountDue: { currency: 'USD', amount: 36 },
        })
        const notOffered = await request(app.getHttpServer())
            .patch(path)
            .send({ method: 'TRANSFERENCIA' })
            .expect(400)
        expect(notOffered.body.details).toEqual([
            { field: 'method', errors: ['Este método de pago no está disponible. Elige otro.'] },
        ])
        await request(app.getHttpServer())
            .patch(`/api/orders/${order.code}/payment-method?t=${'x'.repeat(43)}`)
            .send({ method: 'ZELLE' })
            .expect(404)

        // A Zelle proof: dollars, payer name and account; the payment carries no Bs data.
        const zelle = await payment(order.code, order.accessToken, {
            method: 'ZELLE',
            reference: 'zl-12ab 34',
            payerName: 'Ana Pérez',
            payerAccount: 'ana@example.com',
            amountUsd: '36',
            payerBankCode: '',
            payerPhone: '',
            amountBs: '',
        }).expect(200)
        expect(zelle.body.payments[0]).toMatchObject({
            method: 'ZELLE',
            reference: 'ZL12AB34',
            payerName: 'Ana Pérez',
            payerAccount: 'ana@example.com',
            amountUsd: 36,
            expectedUsd: 36,
            amountBs: null,
            expectedBs: null,
            payerBankCode: null,
            payerPhone: null,
        })
        const locked = await request(app.getHttpServer())
            .patch(path)
            .send({ method: 'PAGO_MOVIL' })
            .expect(409)
        expect(locked.body.message).toBe(
            'El método de pago solo se puede cambiar mientras el pedido espera tu pago.',
        )
    })

    it('records the proof method as the order method and flags duplicates per method', async () => {
        const first = await createOrder()
        const second = await createOrder()
        await payment(first.code, first.accessToken, {
            reference: '445566',
            amountBs: '1',
        }).expect(200)
        // The same digits through Zelle are another payment: not a duplicate.
        await payment(second.code, second.accessToken, {
            method: 'ZELLE',
            reference: '445566',
            payerName: 'Ana',
            payerAccount: '+1 305 555 0134',
            amountUsd: '36',
        }).expect(200)
        expect(orderRow(second.code).paymentMethod).toBe('ZELLE')
        expect(db.table(OrderPayment).map((row) => row.duplicateReference)).toEqual([false, false])

        // A method the store does not offer is refused to the customer.
        const third = await createOrder([{ productId: 'remote-001', quantity: 1 }])
        const binance = await payment(third.code, third.accessToken, {
            method: 'BINANCE',
            reference: '987654321',
            payerAccount: '123456789',
            amountUsd: '36',
        }).expect(400)
        expect(binance.body.details).toEqual([
            { field: 'method', errors: ['Este método de pago no está disponible. Elige otro.'] },
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

        // Pago Móvil references: 4 to 12 digits.
        for (const reference of ['123', '1234567890123', '12AB56']) {
            const wrong = await payment(order.code, order.accessToken, {
                reference,
                amountBs: '1',
            }).expect(400)
            expect(wrong.body.details).toEqual([
                {
                    field: 'reference',
                    errors: ['La referencia del Pago Móvil debe tener entre 4 y 12 dígitos.'],
                },
            ])
        }
        // Each method asks for its own fields.
        const zelle = await payment(order.code, order.accessToken, {
            method: 'ZELLE',
            reference: 'AB12',
            payerName: '',
            payerAccount: 'no es cuenta',
            amountUsd: '',
        }).expect(400)
        expect(zelle.body.details.map((detail: Row) => detail.field).sort()).toEqual([
            'amountUsd',
            'payerAccount',
            'payerName',
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
                method: 'PAGO_MOVIL',
                reference: '889900',
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
                        items: [{ productId: 'split-001', variantId: 'v-110v', quantity: 1 }],
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
        await request(app.getHttpServer()).get('/api/admin/orders/GP-000001').expect(401)
        await request(app.getHttpServer())
            .get('/api/admin/orders/GP-000001/payments/p/proof')
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
        expect(DEFAULT_SITE_CONTENT.payment.pagoMovil.enabled).toBe(false)
    })

    describe('checkout retries (Idempotency-Key)', () => {
        const KEY = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
        const post = (body: Row, key?: string) => {
            const req = request(app.getHttpServer()).post('/api/orders')
            if (key !== undefined) req.set('Idempotency-Key', key)
            return req.send(body)
        }

        it('returns the same order for a retry, taking the stock once', async () => {
            const first = await post(checkout(), KEY).expect(201)
            expect(first.body).toMatchObject({ code: 'GP-000001', replayed: false })
            expect(db.variantStock('v-220v')).toBe(3)
            expect(db.table(Order)[0]).toMatchObject({ idempotencyKey: KEY })
            expect(db.table(Order)[0]?.idempotencyHash).toMatch(/^[a-f0-9]{64}$/)

            // Even once the rate went stale: the retry never re-prices anything.
            db.table(ExchangeRate)[0]!.effectiveDate = '2020-01-01'
            // Same body, other key order and email case: the same request.
            const { items, ...rest } = checkout({ email: 'ANA@example.com' })
            const retry = await post({ items, ...rest }, KEY).expect(200)
            expect(retry.body).toMatchObject({ code: 'GP-000001', replayed: true })
            expect(retry.body.order).toEqual(first.body.order)
            expect(retry.body.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
            expect(retry.body.accessToken).not.toBe(first.body.accessToken)

            expect(db.table(Order)).toHaveLength(1)
            expect(db.variantStock('v-220v')).toBe(3)
            expect(events.map((event) => event.name)).toEqual([ORDER_EVENTS.created])
            // Both links open the order.
            for (const token of [first.body.accessToken, retry.body.accessToken]) {
                await request(app.getHttpServer())
                    .get(`/api/orders/GP-000001?t=${token}`)
                    .expect(200)
            }
        })

        it('refuses the same key with another body (409)', async () => {
            await post(checkout(), KEY).expect(201)
            const other = await post(checkout({ address: 'Otra dirección 123' }), KEY).expect(409)
            expect(other.body).toMatchObject({
                code: 'IDEMPOTENCY_KEY_REUSED',
                message:
                    'Este intento de compra ya se usó con otros datos. Recarga la página e intenta de nuevo.',
            })
            expect(db.table(Order)).toHaveLength(1)
            expect(db.variantStock('v-220v')).toBe(3)
        })

        it('creates one order per request without the header, as before', async () => {
            const first = await post(checkout()).expect(201)
            const second = await post(checkout(), '').expect(201)
            expect([first.body.code, second.body.code]).toEqual(['GP-000001', 'GP-000002'])
            expect(second.body.replayed).toBe(false)
            expect(db.variantStock('v-220v')).toBe(1)
            expect(db.table(Order).map((order) => order.idempotencyKey)).toEqual([null, null])
        })

        it('refuses a malformed key', async () => {
            for (const key of ['short', 'x'.repeat(65), 'has spaces in the key!!']) {
                const response = await post(checkout(), key).expect(400)
                expect(response.body.details).toEqual([
                    {
                        field: 'Idempotency-Key',
                        errors: [
                            'El identificador del intento de compra no es válido. Recarga la página.',
                        ],
                    },
                ])
            }
            expect(db.table(Order)).toHaveLength(0)
        })

        it('answers concurrent duplicates with one order (the loser is rolled back)', async () => {
            db.isolatedTransactions = true
            const [a, b] = await Promise.all([post(checkout(), KEY), post(checkout(), KEY)])
            expect([a.status, b.status].sort()).toEqual([200, 201])
            expect(a.body.code).toBe(b.body.code)
            expect(db.table(Order)).toHaveLength(1)
            expect(db.variantStock('v-220v')).toBe(3)
            expect(db.stock('split-001')).toBe(6)
        })

        it('replays when the unique index catches a retry that missed the lookup', async () => {
            db.isolatedTransactions = true
            await post(checkout(), KEY).expect(201)
            // The retry's lookup runs before the first request commits: it finds nothing.
            const getRepository = db.dataSource.getRepository
            let missed = false
            db.dataSource.getRepository = (entity: unknown) => {
                const repository = getRepository(entity)
                if (entity !== Order || missed) return repository
                return {
                    ...repository,
                    findOne: (options: { where?: Row }) => {
                        if (options.where?.idempotencyKey && !missed) {
                            missed = true
                            return Promise.resolve(null)
                        }
                        return (
                            repository as { findOne: (o: unknown) => Promise<unknown> }
                        ).findOne(options)
                    },
                } as ReturnType<typeof getRepository>
            }

            const retry = await post(checkout(), KEY).expect(200)
            expect(missed).toBe(true)
            expect(retry.body).toMatchObject({ code: 'GP-000001', replayed: true })
            expect(db.table(Order)).toHaveLength(1)
            // The losing transaction took stock and inserted rows; all of it was rolled back.
            expect(db.variantStock('v-220v')).toBe(3)
            expect(db.table(OrderAccessLink)).toHaveLength(2)
        })

        it('frees a key older than 24 hours and creates a new order', async () => {
            await post(checkout(), KEY).expect(201)
            db.table(Order)[0]!.createdAt = new Date(Date.now() - 25 * 60 * 60_000)
            const later = await post(checkout({ address: 'Otra dirección 123' }), KEY).expect(201)
            expect(later.body).toMatchObject({ code: 'GP-000002', replayed: false })
            expect(db.table(Order).map((order) => order.idempotencyKey)).toEqual([null, KEY])
            expect(db.variantStock('v-220v')).toBe(1)
        })
    })
})
