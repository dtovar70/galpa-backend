import {
    BadRequestException,
    ConflictException,
    Injectable,
    Logger,
    NotFoundException,
    ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import { Brackets, DataSource, In, type EntityManager } from 'typeorm'
import type { PdfFile } from '../common/http/send-pdf.js'
import type { AuthUser } from '../common/types/auth-user.js'
import { caracasDay, formatDay } from '../common/utils/caracas-date.js'
import type { Env } from '../config/env.schema.js'
import { ContentService } from '../content/content.service.js'
import { newId } from '../database/id.js'
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service.js'
import { MailService } from '../mail/mail.service.js'
import { toCents } from '../orders/order-pricing.js'
import { accessTokenMatchesAny, generateAccessToken } from '../orders/order-token.js'
import { fieldError, OrdersService, type QuoteLineInput } from '../orders/orders.service.js'
import { toWhatsAppPhone, whatsAppUrl } from '../orders/whatsapp/whatsapp-template.js'
import { Product } from '../products/entities/product.entity.js'
import { QUOTE_CODE_PATTERN, QUOTES_PAGE_SIZE } from './dto/field-names.js'
import type {
    ConvertQuoteDto,
    QuoteItemInputDto,
    QuoteQueryDto,
    QuoteStatusDto,
    SaveQuoteDto,
} from './dto/quote.dto.js'
import { QuoteAccessLink } from './entities/quote-access-link.entity.js'
import { QuoteItem } from './entities/quote-item.entity.js'
import { Quote } from './entities/quote.entity.js'
import { quoteEmail, quoteWhatsAppText } from './quote-messages.js'
import { renderQuotePdf } from './quote-pdf.js'
import { sortedQuoteItems, toQuoteDto, type QuoteDto, type QuoteListDto } from './quote.mapper.js'
import {
    canTransitionQuote,
    CONVERTIBLE_QUOTE_STATUSES,
    EDITABLE_QUOTE_STATUSES,
    invalidQuoteTransitionMessage,
    QUOTE_STATUS_LABELS,
    SENDABLE_QUOTE_STATUSES,
    type QuoteActor,
    type QuoteStatus,
} from './quote-status.js'
import { computeQuoteTotals } from './quote-totals.js'

export const QUOTE_NOT_FOUND = 'No encontramos la cotización.'

export type QuotePdfFile = PdfFile

/** `{ message, url }` of "Enviar por WhatsApp" (`url` null when the phone is not a mobile). */
export interface QuoteWhatsAppDto {
    message: string
    url: string | null
    /** The public PDF link included in the message. */
    pdfUrl: string
}

/** Quote lines as order lines (`OrdersService.createFromQuote`), in the quote's order. */
export function quoteLinesForOrder(quote: Pick<Quote, 'items'>): QuoteLineInput[] {
    return sortedQuoteItems(quote).map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        description: item.description,
        brand: item.brand,
        model: item.model,
        unitCents: toCents(item.unitPriceUsd),
        quantity: item.quantity,
    }))
}

/**
 * The store's quotes (admin): create and edit them, move them through their workflow, render
 * the PDF, send it by email or WhatsApp and convert them into an order.
 */
@Injectable()
export class QuotesService {
    private readonly logger = new Logger(QuotesService.name)
    private readonly apiUrl: string

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly content: ContentService,
        private readonly rates: ExchangeRateService,
        private readonly mail: MailService,
        private readonly orders: OrdersService,
        config: ConfigService<Env, true>,
    ) {
        this.apiUrl = config.get('PUBLIC_API_URL', { infer: true })
    }

    async list(query: QuoteQueryDto): Promise<QuoteListDto> {
        const page = query.page
        const qb = this.dataSource.getRepository(Quote).createQueryBuilder('q')
        if (query.status) qb.andWhere('q.status = :status', { status: query.status })
        const search = query.search?.trim()
        if (search) {
            qb.andWhere(
                new Brackets((where) => {
                    where
                        .where('q.code ILIKE :like', { like: `%${search}%` })
                        .orWhere('q.customerName ILIKE :like')
                        .orWhere('q.customerEmail ILIKE :like')
                        .orWhere('q.customerCompany ILIKE :like')
                }),
            )
        }
        const [rows, total] = await qb
            .orderBy('q.createdAt', 'DESC')
            .addOrderBy('q.code', 'DESC')
            .skip((page - 1) * QUOTES_PAGE_SIZE)
            .take(QUOTES_PAGE_SIZE)
            .getManyAndCount()
        const full = await this.loadMany(rows.map((row) => row.id))
        return { items: full.map(toQuoteDto), total, page, pageSize: QUOTES_PAGE_SIZE }
    }

    async get(code: string): Promise<QuoteDto> {
        return toQuoteDto(await this.load(code))
    }

    async create(dto: SaveQuoteDto, user: AuthUser): Promise<QuoteDto> {
        this.assertValidUntil(dto.validUntil)
        const id = newId()
        await this.dataSource.transaction(async (manager) => {
            const [{ seq }] = (await manager.query(
                `SELECT nextval('quote_code_seq')::int AS "seq"`,
            )) as [{ seq: number }]
            const now = new Date()
            await manager.insert(Quote, {
                id,
                code: `COT-${String(seq).padStart(6, '0')}`,
                status: 'BORRADOR',
                statusReason: null,
                createdById: user.id,
                sentAt: null,
                convertedOrderId: null,
                convertedOrderCode: null,
                createdAt: now,
                updatedAt: now,
                ...(await this.quoteFields(manager, dto)),
            })
            await this.insertItems(manager, id, dto.items)
        })
        const created = await this.loadById(id)
        this.logger.log(`Quote ${created.code} created by ${user.id}`)
        return toQuoteDto(created)
    }

    /** Replaces the whole quote (lines included); only while BORRADOR or ENVIADA. */
    async update(code: string, dto: SaveQuoteDto): Promise<QuoteDto> {
        this.assertValidUntil(dto.validUntil)
        await this.dataSource.transaction(async (manager) => {
            const quote = await this.lockByCode(manager, code)
            if (!EDITABLE_QUOTE_STATUSES.includes(quote.status)) {
                throw new ConflictException(
                    `Una cotización ${QUOTE_STATUS_LABELS[quote.status].toLowerCase()} ya no se puede editar.`,
                )
            }
            await manager.update(Quote, { id: quote.id }, await this.quoteFields(manager, dto))
            await manager.delete(QuoteItem, { quoteId: quote.id })
            await this.insertItems(manager, quote.id, dto.items)
        })
        return this.get(code)
    }

    async changeStatus(code: string, dto: QuoteStatusDto): Promise<QuoteDto> {
        if (dto.status === 'CONVERTIDA') {
            throw new BadRequestException(
                'Para convertir la cotización en un pedido usa «Convertir».',
            )
        }
        await this.dataSource.transaction(async (manager) => {
            const quote = await this.lockByCode(manager, code)
            await this.applyStatus(manager, quote, dto.status, 'admin', dto.reason ?? null)
        })
        return this.get(code)
    }

    /** Only drafts can be deleted. */
    async remove(code: string): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            const quote = await this.lockByCode(manager, code)
            if (quote.status !== 'BORRADOR') {
                throw new ConflictException('Solo se pueden eliminar las cotizaciones en borrador.')
            }
            await manager.delete(Quote, { id: quote.id })
        })
    }

    /** The PDF for the admin. */
    async pdf(code: string): Promise<QuotePdfFile> {
        return this.render(await this.load(code))
    }

    /** The public PDF: 404 unless the token opens one of the quote's links. */
    async publicPdf(code: string, token: string | undefined): Promise<QuotePdfFile> {
        const quote = QUOTE_CODE_PATTERN.test(code)
            ? await this.dataSource
                  .getRepository(Quote)
                  .findOne({ where: { code }, select: { id: true } })
            : null
        const links = quote
            ? await this.dataSource.getRepository(QuoteAccessLink).find({
                  where: { quoteId: quote.id },
                  select: { id: true, tokenHash: true },
              })
            : []
        const matched = accessTokenMatchesAny(
            token,
            links.map((link) => link.tokenHash),
        )
        if (!quote || !matched) throw new NotFoundException(QUOTE_NOT_FOUND)
        return this.render(await this.loadById(quote.id))
    }

    /**
     * Emails the PDF (attached, plus a public link) to the customer and marks the quote ENVIADA.
     * 400 without an email or once `validUntil` passed; 503 when the email could not be sent.
     */
    async send(code: string): Promise<QuoteDto> {
        const quote = await this.load(code)
        if (!SENDABLE_QUOTE_STATUSES.includes(quote.status)) {
            throw new ConflictException(
                `Una cotización ${QUOTE_STATUS_LABELS[quote.status].toLowerCase()} no se puede enviar.`,
            )
        }
        if (!quote.customerEmail) {
            throw fieldError(
                'customerEmail',
                'Agrega el correo del cliente para enviarle la cotización.',
            )
        }
        this.assertValidUntil(quote.validUntil)

        const content = await this.content.getAll()
        const pdfUrl = await this.issuePublicUrl(quote)
        const file = await this.render(quote)
        const email = quoteEmail(quote, pdfUrl, {
            brandName: content.general.brandName,
            contact: content.contact,
        })
        const sent = await this.mail.send(
            {
                to: quote.customerEmail,
                ...email,
                attachments: [
                    {
                        filename: file.filename,
                        content: file.content,
                        contentType: 'application/pdf',
                    },
                ],
            },
            `quote ${quote.code}`,
        )
        if (!sent) {
            throw new ServiceUnavailableException(
                'No pudimos enviar el correo. Intenta de nuevo o envía la cotización por WhatsApp.',
            )
        }
        await this.dataSource.transaction(async (manager) => {
            const locked = await this.lockByCode(manager, code)
            const changes: Partial<Quote> = { sentAt: new Date() }
            if (locked.status === 'BORRADOR') {
                if (!canTransitionQuote(locked.status, 'ENVIADA', 'admin')) {
                    throw new ConflictException(
                        invalidQuoteTransitionMessage(locked.status, 'ENVIADA'),
                    )
                }
                changes.status = 'ENVIADA'
            }
            await manager.update(Quote, { id: locked.id }, changes)
        })
        return this.get(code)
    }

    /** "Enviar por WhatsApp": the message with a fresh public PDF link and the wa.me link. */
    async whatsappMessage(code: string): Promise<QuoteWhatsAppDto> {
        const quote = await this.load(code)
        const content = await this.content.getAll()
        const pdfUrl = await this.issuePublicUrl(quote)
        const message = quoteWhatsAppText(quote, pdfUrl, content.general.brandName)
        const phone = quote.customerPhone ? toWhatsAppPhone(quote.customerPhone) : null
        return { message, url: phone ? whatsAppUrl(phone, message) : null, pdfUrl }
    }

    /**
     * Creates a PENDIENTE_PAGO order from the quote (its prices, lines and discount) and marks the
     * quote CONVERTIDA in the same transaction. The order's customer link is returned once.
     */
    async convert(
        code: string,
        dto: ConvertQuoteDto,
        user: AuthUser,
    ): Promise<{ orderCode: string; customerUrl: string }> {
        const quote = await this.load(code)
        assertConvertible(quote)
        if (!quote.customerEmail) {
            throw fieldError(
                'customerEmail',
                'Agrega el correo del cliente antes de crear el pedido.',
            )
        }
        if (!quote.customerPhone) {
            throw fieldError(
                'customerPhone',
                'Agrega el teléfono del cliente antes de crear el pedido.',
            )
        }
        if (dto.deliveryMethod === 'delivery' && (!dto.address || !dto.city)) {
            throw fieldError(
                dto.address ? 'city' : 'address',
                'Para un envío indica la dirección y la ciudad.',
            )
        }

        const created = await this.orders.createFromQuote(
            {
                customerName: quote.customerName,
                customerEmail: quote.customerEmail,
                customerPhone: quote.customerPhone,
                customerIdNumber: quote.customerIdNumber,
                city: dto.city ?? '',
                address: dto.address ?? '',
                deliveryMethod: dto.deliveryMethod,
                notes: '',
                paymentMethod: dto.paymentMethod,
                wantsInstallation: false,
            },
            quoteLinesForOrder(quote),
            toCents(quote.discountUsd),
            user.id,
            `Pedido creado desde la cotización ${quote.code}.`,
            async (manager, order) => {
                // Locked here so two conversions of the same quote never both succeed.
                const locked = await this.lockByCode(manager, code)
                assertConvertible(locked)
                await manager.update(
                    Quote,
                    { id: locked.id },
                    {
                        status: 'CONVERTIDA',
                        convertedOrderId: order.id,
                        convertedOrderCode: order.code,
                    },
                )
            },
        )
        this.logger.log(`Quote ${quote.code} converted into order ${created.code}`)
        return { orderCode: created.code, customerUrl: created.customerUrl }
    }

    /**
     * ENVIADA quotes whose `validUntil` day passed (Caracas calendar) become VENCIDA. Returns how
     * many were expired.
     */
    async expireOverdue(today = caracasDay()): Promise<number> {
        const overdue = await this.dataSource
            .getRepository(Quote)
            .createQueryBuilder('q')
            .select(['q.id', 'q.code'])
            .where('q.status = :status', { status: 'ENVIADA' })
            .andWhere('q.validUntil < :today', { today })
            .getMany()
        let expired = 0
        for (const { code } of overdue) {
            const changed = await this.dataSource.transaction(async (manager) => {
                const locked = await this.lockByCode(manager, code)
                // Accepted (or edited) in the meantime: nothing to do.
                if (locked.status !== 'ENVIADA' || locked.validUntil >= today) return false
                await this.applyStatus(manager, locked, 'VENCIDA', 'system', null)
                return true
            })
            if (changed) expired += 1
        }
        if (expired) this.logger.log(`Expired ${expired} quote(s)`)
        return expired
    }

    private async applyStatus(
        manager: EntityManager,
        quote: Quote,
        to: QuoteStatus,
        actor: QuoteActor,
        reason: string | null,
    ): Promise<void> {
        if (quote.status === to) return
        if (!canTransitionQuote(quote.status, to, actor)) {
            throw new ConflictException(invalidQuoteTransitionMessage(quote.status, to))
        }
        await manager.update(
            Quote,
            { id: quote.id },
            { status: to, statusReason: reason?.trim() || null },
        )
    }

    private assertValidUntil(validUntil: string): void {
        if (validUntil < caracasDay()) {
            throw fieldError('validUntil', 'La fecha de vigencia no puede estar en el pasado.')
        }
    }

    /** The header columns of the quote and its totals (the rate is a reference). */
    private async quoteFields(manager: EntityManager, dto: SaveQuoteDto): Promise<Partial<Quote>> {
        await this.assertProductsExist(manager, dto.items)
        const rate = await this.rates.latest()
        const totals = computeQuoteTotals(
            dto.items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice })),
            dto.discount ?? 0,
            rate?.rate ?? null,
        )
        return {
            customerName: dto.customerName,
            customerEmail: dto.customerEmail?.toLowerCase() ?? null,
            customerPhone: dto.customerPhone ?? null,
            customerIdNumber: dto.customerIdNumber ?? null,
            customerCompany: dto.customerCompany ?? null,
            notes: dto.notes ?? '',
            terms: dto.terms ?? '',
            validUntil: dto.validUntil,
            subtotalUsd: totals.subtotal,
            discountUsd: totals.discount,
            totalUsd: totals.total,
            exchangeRate: rate?.rate ?? null,
            totalBs: totals.totalBs,
        }
    }

    private async assertProductsExist(
        manager: EntityManager,
        items: readonly QuoteItemInputDto[],
    ): Promise<void> {
        const ids = [...new Set(items.flatMap((item) => (item.productId ? [item.productId] : [])))]
        if (!ids.length) return
        const found = await manager.find(Product, { where: { id: In(ids) }, select: { id: true } })
        const known = new Set(found.map((product) => product.id))
        const index = items.findIndex((item) => item.productId && !known.has(item.productId))
        if (index >= 0) throw fieldError(`items.${index}.productId`, 'Este producto ya no existe.')
    }

    /** Inserts the lines; product lines take the product's slug, brand and model when not sent. */
    private async insertItems(
        manager: EntityManager,
        quoteId: string,
        items: readonly QuoteItemInputDto[],
    ): Promise<void> {
        const ids = [...new Set(items.flatMap((item) => (item.productId ? [item.productId] : [])))]
        const products = ids.length
            ? await manager.find(Product, {
                  where: { id: In(ids) },
                  select: { id: true, slug: true, brand: true, model: true },
              })
            : []
        const byId = new Map(products.map((product) => [product.id, product]))
        const totals = computeQuoteTotals(
            items.map((item) => ({ quantity: item.quantity, unitPrice: item.unitPrice })),
            0,
            null,
        )
        await manager.insert(
            QuoteItem,
            items.map((item, index) => {
                const product = item.productId ? byId.get(item.productId) : undefined
                return {
                    id: newId(),
                    quoteId,
                    productId: product?.id ?? null,
                    variantId: product ? (item.variantId ?? null) : null,
                    productSlug: product?.slug ?? null,
                    description: item.description,
                    brand: item.brand ?? product?.brand ?? null,
                    model: item.model ?? product?.model ?? null,
                    quantity: item.quantity,
                    unitPriceUsd: item.unitPrice,
                    lineTotalUsd: totals.lineTotals[index] ?? 0,
                    sortOrder: index,
                }
            }),
        )
    }

    /** A fresh public link to the PDF (only its hash is stored). */
    private async issuePublicUrl(quote: Quote): Promise<string> {
        const { token, hash } = generateAccessToken()
        await this.dataSource.getRepository(QuoteAccessLink).insert({
            id: newId(),
            quoteId: quote.id,
            tokenHash: hash,
            createdAt: new Date(),
        })
        return `${this.apiUrl}/api/quotes/${encodeURIComponent(quote.code)}/pdf?t=${encodeURIComponent(token)}`
    }

    private async render(quote: Quote): Promise<QuotePdfFile> {
        const content = await this.content.getAll()
        const pdf = await renderQuotePdf({
            brandName: content.general.brandName,
            tagline: content.general.tagline,
            contact: content.contact,
            code: quote.code,
            issuedOn: formatDay(caracasDay(quote.createdAt)),
            validUntil: formatDay(quote.validUntil),
            customer: {
                name: quote.customerName,
                company: quote.customerCompany,
                idNumber: quote.customerIdNumber,
                email: quote.customerEmail,
                phone: quote.customerPhone,
            },
            items: sortedQuoteItems(quote).map((item) => ({
                description: item.description,
                brandModel: [item.brand, item.model].filter(Boolean).join(' · ') || null,
                quantity: item.quantity,
                unitUsd: item.unitPriceUsd,
                totalUsd: item.lineTotalUsd,
            })),
            subtotalUsd: quote.subtotalUsd,
            discountUsd: quote.discountUsd,
            totalUsd: quote.totalUsd,
            exchangeRate: quote.exchangeRate,
            totalBs: quote.totalBs,
            notes: quote.notes,
            terms: quote.terms,
        })
        return { filename: `cotizacion-${quote.code}.pdf`, content: pdf }
    }

    private lockByCode(manager: EntityManager, code: string): Promise<Quote> {
        return manager
            .createQueryBuilder(Quote, 'q')
            .setLock('pessimistic_write')
            .where('q.code = :code', { code })
            .getOne()
            .then((quote) => {
                if (!quote) throw new NotFoundException(QUOTE_NOT_FOUND)
                return quote
            })
    }

    private async load(code: string): Promise<Quote> {
        const row = await this.dataSource
            .getRepository(Quote)
            .findOne({ where: { code }, select: { id: true } })
        if (!row) throw new NotFoundException(QUOTE_NOT_FOUND)
        return this.loadById(row.id)
    }

    private async loadById(id: string): Promise<Quote> {
        const [quote] = await this.loadMany([id])
        if (!quote) throw new NotFoundException(QUOTE_NOT_FOUND)
        return quote
    }

    private async loadMany(ids: readonly string[]): Promise<Quote[]> {
        if (!ids.length) return []
        const rows = await this.dataSource.getRepository(Quote).find({
            where: { id: In([...ids]) },
            relations: { items: true, createdBy: true },
        })
        const byId = new Map(rows.map((row) => [row.id, row]))
        return ids.flatMap((id) => byId.get(id) ?? [])
    }
}

/** 409 unless the quote may still become an order. */
function assertConvertible(quote: Pick<Quote, 'status' | 'convertedOrderCode'>): void {
    if (quote.status === 'CONVERTIDA') {
        throw new ConflictException(
            quote.convertedOrderCode
                ? `Esta cotización ya se convirtió en el pedido ${quote.convertedOrderCode}.`
                : 'Esta cotización ya se convirtió en un pedido.',
        )
    }
    if (!CONVERTIBLE_QUOTE_STATUSES.includes(quote.status)) {
        throw new ConflictException(
            `Una cotización ${QUOTE_STATUS_LABELS[quote.status].toLowerCase()} no se puede convertir en pedido.`,
        )
    }
}
