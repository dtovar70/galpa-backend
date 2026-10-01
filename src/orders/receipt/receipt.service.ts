import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { OrderStatusCatalogService } from '../../catalogs/order-status-catalog.service.js'
import { ContentService } from '../../content/content.service.js'
import type { PdfFile } from '../../common/http/send-pdf.js'
import { PAYMENT_METHOD_LABELS, paysInBolivars } from '../../common/payment-methods.js'
import { formatDay } from '../../common/utils/caracas-date.js'
import { formatBs, formatUsd } from '../../common/utils/money-format.js'
import { RATE_SOURCE_LABELS } from '../../exchange-rate/providers/rate-provider.js'
import type { OrderPayment } from '../entities/order-payment.entity.js'
import { Order } from '../entities/order.entity.js'
import { OrderAccessService } from '../order-access.service.js'
import { ORDER_NOT_FOUND } from '../order-status.service.js'
import { orderQrPng } from '../qr/order-qr.js'
import { verifiedPayment } from './receipt-availability.js'
import { renderReceiptPdf, type ReceiptData } from './receipt-pdf.js'

export const RECEIPT_NOT_AVAILABLE =
    'El comprobante de compra estará disponible cuando verifiquemos el pago del pedido.'
export const RECEIPT_CANCELLED =
    'Este pedido fue cancelado, así que no tiene comprobante de compra.'

export type ReceiptFile = PdfFile

const dateTimeFormatter = new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
})

/** Instant in Caracas time: "25/09/2026, 10:42 a. m.". */
export function formatCaracasDateTime(date: Date): string {
    return dateTimeFormatter.format(date).replace(/ | /g, ' ')
}

/** The verified payment's details as printed, per method. */
export function paymentDetailRows(payment: OrderPayment): [string, string][] {
    const paidOn: [string, string] = ['Fecha del pago', formatDay(payment.paidOn)]
    switch (payment.method) {
        case 'PAGO_MOVIL':
            return [
                ['Banco', payment.payerBankName ?? '—'],
                ['Referencia', payment.reference],
                ['Teléfono pagador', payment.payerPhone ?? '—'],
                paidOn,
                ['Monto pagado', formatBs(payment.amountBs ?? 0)],
            ]
        case 'TRANSFERENCIA':
            return [
                ['Banco', payment.payerBankName ?? '—'],
                ['Referencia', payment.reference],
                ['Cédula/RIF', payment.payerIdNumber ?? '—'],
                paidOn,
                ['Monto pagado', formatBs(payment.amountBs ?? 0)],
            ]
        case 'ZELLE':
            return [
                ['Titular', payment.payerName ?? '—'],
                ['Cuenta Zelle', payment.payerAccount ?? '—'],
                ['Confirmación', payment.reference],
                paidOn,
                ['Monto pagado', formatUsd(payment.amountUsd ?? 0)],
            ]
        case 'BINANCE':
            return [
                ['Cuenta Binance', payment.payerAccount ?? '—'],
                ['ID de la orden', payment.reference],
                paidOn,
                ['Monto pagado', formatUsd(payment.amountUsd ?? 0)],
            ]
    }
}

/**
 * The "Comprobante de compra" PDF: for the customer (private link token) and the admin. Only
 * available for an order with a verified payment that is not cancelled (409 otherwise).
 */
@Injectable()
export class ReceiptService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly access: OrderAccessService,
        private readonly catalog: OrderStatusCatalogService,
        private readonly content: ContentService,
    ) {}

    /** The QR points at the same link (token) the customer used to download it. */
    async forCustomer(code: string, token: string | undefined): Promise<ReceiptFile> {
        const order = await this.access.findAuthorized(code, token)
        return this.render(order.code, () =>
            Promise.resolve(this.access.customerUrl(order.code, token as string)),
        )
    }

    /**
     * The QR needs a customer link: an admin-issued one from the last 24 hours is reused when
     * possible, otherwise a new one is issued on behalf of `userId` (only once the receipt is
     * known to be available, so a 409 never leaves a stray link behind).
     */
    forAdmin(code: string, userId: string): Promise<ReceiptFile> {
        return this.render(code, (order) =>
            this.access.linkForAdminReceipt(order.id, order.code, userId),
        )
    }

    private async render(
        code: string,
        linkFor: (order: Order) => Promise<string>,
    ): Promise<ReceiptFile> {
        const order = await this.dataSource.getRepository(Order).findOne({
            where: { code },
            relations: { items: true, payments: true },
        })
        if (!order) throw new NotFoundException(ORDER_NOT_FOUND)
        const payments = order.payments ?? []
        if (order.status === 'CANCELADO') throw new ConflictException(RECEIPT_CANCELLED)
        const payment = verifiedPayment(payments)
        if (!payment) throw new ConflictException(RECEIPT_NOT_AVAILABLE)

        const [content, label] = await Promise.all([this.content.getAll(), this.catalog.labeler()])
        const orderQr = await orderQrPng(await linkFor(order), 360)
        const data: ReceiptData = {
            orderQr,
            brandName: content.general.brandName,
            tagline: content.general.tagline,
            contact: {
                phone: content.contact.phone,
                whatsapp: content.contact.whatsapp,
                email: content.contact.email,
                city: content.contact.city,
                instagram: content.contact.instagram,
            },
            code: order.code,
            issuedAt: formatCaracasDateTime(new Date()),
            verifiedAt: payment.reviewedAt ? formatCaracasDateTime(payment.reviewedAt) : null,
            statusLabel: label(order.status),
            customer: {
                name: order.customerName,
                email: order.customerEmail,
                phone: order.customerPhone,
                idNumber: order.customerIdNumber,
            },
            delivery:
                order.deliveryMethod === 'pickup'
                    ? { method: 'Retiro en tienda', address: content.contact.city }
                    : {
                          method: 'Envío a domicilio',
                          address: [order.address, order.city].filter(Boolean).join(', '),
                      },
            items: [...(order.items ?? [])]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((item) => ({
                    name: item.productName,
                    variant: item.variantLabel,
                    brandModel: [item.brand, item.model].filter(Boolean).join(' · ') || null,
                    onOrder: Boolean(item.productId) && item.stockMode === 'ON_ORDER',
                    quantity: item.quantity,
                    unitUsd: item.unitPriceUsd,
                    totalUsd: item.lineTotalUsd,
                })),
            subtotalUsd: order.subtotalUsd,
            discountUsd: order.discountUsd,
            shippingUsd: order.shippingUsd,
            totalUsd: order.totalUsd,
            exchangeRate: order.exchangeRate,
            exchangeRateDate: formatDay(order.exchangeRateDate),
            exchangeRateSource:
                RATE_SOURCE_LABELS[order.exchangeRateSource] ?? order.exchangeRateSource,
            totalBs: order.totalBs,
            payment: {
                methodLabel: PAYMENT_METHOD_LABELS[payment.method],
                inBolivars: paysInBolivars(payment.method),
                details: paymentDetailRows(payment),
            },
        }
        return { filename: `comprobante-${order.code}.pdf`, content: await renderReceiptPdf(data) }
    }
}
