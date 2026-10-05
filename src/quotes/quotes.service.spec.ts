import { BadRequestException, ConflictException } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import type { DataSource, EntityManager } from 'typeorm'
import { quoteStatusRows } from '../../test/fixtures/catalogs.js'
import { Role } from '../auth/role.enum.js'
import type { AuthUser } from '../common/types/auth-user.js'
import type { Env } from '../config/env.schema.js'
import type { QuoteStatusCatalogService } from '../catalogs/quote-status-catalog.service.js'
import type { ContentService } from '../content/content.service.js'
import type { ExchangeRateService } from '../exchange-rate/exchange-rate.service.js'
import type { MailService } from '../mail/mail.service.js'
import type { Order } from '../orders/entities/order.entity.js'
import type { OrdersService } from '../orders/orders.service.js'
import type { QuoteItem } from './entities/quote-item.entity.js'
import { Quote } from './entities/quote.entity.js'
import type { QuoteStatus } from './quote-status.js'
import { quoteLinesForOrder, QuotesService } from './quotes.service.js'

const USER: AuthUser = {
    id: 'admin-1',
    email: 'admin@galpa.com.ve',
    name: 'Admin',
    role: Role.EDITOR,
    createdAt: new Date(),
    updatedAt: new Date(),
}

function item(fields: Partial<QuoteItem>): QuoteItem {
    return {
        id: 'i',
        quoteId: 'q1',
        productId: null,
        variantId: null,
        productSlug: null,
        description: 'Línea',
        brand: null,
        model: null,
        quantity: 1,
        unitPriceUsd: 10,
        lineTotalUsd: 10,
        sortOrder: 0,
        ...fields,
    } as QuoteItem
}

function quote(status: QuoteStatus, fields: Partial<Quote> = {}): Quote {
    return Object.assign(new Quote(), {
        id: 'q1',
        code: 'COT-000045',
        status,
        statusReason: null,
        customerName: 'Hotel Los Andes',
        customerEmail: 'compras@losandes.com',
        customerPhone: '0414-1234567',
        customerIdNumber: 'J-123456789',
        customerCompany: 'Hotel Los Andes C.A.',
        notes: '',
        terms: '',
        validUntil: '2999-12-31',
        subtotalUsd: 2010,
        discountUsd: 60.5,
        totalUsd: 1949.5,
        exchangeRate: null,
        totalBs: null,
        createdById: null,
        createdBy: null,
        sentAt: null,
        convertedOrderId: null,
        convertedOrderCode: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        items: [
            item({ id: 'i2', description: 'Instalación', unitPriceUsd: 60, sortOrder: 1 }),
            item({
                id: 'i1',
                productId: 'p-pt36',
                productSlug: 'piso-techo-gree-36000-btu',
                description: 'Piso-techo Gree 36.000 BTU',
                brand: 'Gree',
                model: 'GTH36K3FI',
                unitPriceUsd: 1950,
                sortOrder: 0,
            }),
        ],
        ...fields,
    })
}

function setup(current: Quote) {
    const locked = { ...current }
    const manager = {
        update: vi.fn().mockResolvedValue(undefined),
        createQueryBuilder: vi.fn(() => ({
            setLock: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            getOne: vi.fn().mockResolvedValue(locked),
        })),
    }
    const repository = {
        findOne: vi.fn().mockResolvedValue({ id: current.id }),
        find: vi.fn().mockResolvedValue([current]),
    }
    const dataSource = {
        getRepository: vi.fn(() => repository),
        transaction: vi.fn((work: (value: typeof manager) => Promise<unknown>) => work(manager)),
    }
    const orders = {
        createFromQuote: vi.fn(
            async (
                ..._args: Parameters<OrdersService['createFromQuote']>
            ): ReturnType<OrdersService['createFromQuote']> => {
                const inTransaction = _args[5]
                await inTransaction(
                    manager as unknown as EntityManager,
                    {
                        id: 'o1',
                        code: 'GP-000077',
                    } as Order,
                )
                return {
                    code: 'GP-000077',
                    customerUrl: 'https://galpa.com.ve/pedido/GP-000077?t=x',
                }
            },
        ),
    }
    const config = { get: vi.fn().mockReturnValue('https://api.galpa.com.ve') }
    const labels = new Map(quoteStatusRows().map((row) => [row.code, row.label]))
    const statusCatalog = {
        labeler: vi.fn(() => Promise.resolve((code: string) => labels.get(code) ?? code)),
    }
    const service = new QuotesService(
        dataSource as unknown as DataSource,
        {} as ContentService,
        {} as ExchangeRateService,
        {} as MailService,
        orders as unknown as OrdersService,
        statusCatalog as unknown as QuoteStatusCatalogService,
        config as unknown as ConfigService<Env, true>,
    )
    return { service, orders, manager }
}

describe('quoteLinesForOrder', () => {
    it('keeps the quote order and prices, product lines and free-text lines alike', () => {
        expect(quoteLinesForOrder(quote('ACEPTADA'))).toEqual([
            {
                productId: 'p-pt36',
                variantId: null,
                description: 'Piso-techo Gree 36.000 BTU',
                brand: 'Gree',
                model: 'GTH36K3FI',
                unitCents: 195000,
                quantity: 1,
            },
            {
                productId: null,
                variantId: null,
                description: 'Instalación',
                brand: null,
                model: null,
                unitCents: 6000,
                quantity: 1,
            },
        ])
    })
})

describe('QuotesService.convert', () => {
    const DTO = { deliveryMethod: 'pickup' as const, paymentMethod: 'ZELLE' as const }

    it('creates the order with the quote customer, lines and discount, and marks it CONVERTIDA', async () => {
        const { service, orders, manager } = setup(quote('ACEPTADA'))
        await expect(service.convert('COT-000045', DTO, USER)).resolves.toEqual({
            orderCode: 'GP-000077',
            customerUrl: 'https://galpa.com.ve/pedido/GP-000077?t=x',
        })
        const [details, lines, discountCents, userId, note] = orders.createFromQuote.mock.calls[0]!
        expect(details).toMatchObject({
            customerName: 'Hotel Los Andes',
            customerEmail: 'compras@losandes.com',
            customerIdNumber: 'J-123456789',
            deliveryMethod: 'pickup',
            paymentMethod: 'ZELLE',
            city: '',
            address: '',
        })
        expect(lines).toHaveLength(2)
        expect(discountCents).toBe(6050)
        expect(userId).toBe('admin-1')
        expect(note).toBe('Pedido creado desde la cotización COT-000045.')
        expect(manager.update).toHaveBeenCalledWith(
            Quote,
            { id: 'q1' },
            { status: 'CONVERTIDA', convertedOrderId: 'o1', convertedOrderCode: 'GP-000077' },
        )
    })

    it('refuses a converted, rejected or expired quote', async () => {
        for (const status of ['CONVERTIDA', 'RECHAZADA', 'VENCIDA'] as const) {
            const { service, orders } = setup(quote(status, { convertedOrderCode: 'GP-000001' }))
            await expect(service.convert('COT-000045', DTO, USER)).rejects.toBeInstanceOf(
                ConflictException,
            )
            expect(orders.createFromQuote).not.toHaveBeenCalled()
        }
    })

    it('needs the address for a delivery and the customer email', async () => {
        const delivery = setup(quote('ENVIADA'))
        await expect(
            delivery.service.convert(
                'COT-000045',
                { ...DTO, deliveryMethod: 'delivery', city: 'Caracas' },
                USER,
            ),
        ).rejects.toBeInstanceOf(BadRequestException)

        const noEmail = setup(quote('ENVIADA', { customerEmail: null }))
        await expect(noEmail.service.convert('COT-000045', DTO, USER)).rejects.toBeInstanceOf(
            BadRequestException,
        )
        expect(noEmail.orders.createFromQuote).not.toHaveBeenCalled()
    })
})
