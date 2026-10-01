import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
    ORDER_EVENTS,
    type OrderCreatedEvent,
    type OrderPaymentSubmittedEvent,
    type OrderStatusChangedEvent,
} from '../orders/orders.events.js'
import {
    EXCHANGE_RATE_EVENTS,
    type RateSyncFailingEvent,
    type RateSyncRecoveredEvent,
} from '../exchange-rate/exchange-rate.events.js'
import { CONTACT_EVENTS, type ContactMessageReceivedEvent } from '../contact/contact.events.js'
import { TelegramBotService } from './telegram-bot.service.js'
import { TelegramContactService } from './telegram-contact.service.js'
import {
    escapeHtml,
    formatCaracasTime,
    rateSyncFailingMessage,
    rateSyncRecoveredMessage,
    truncate,
} from './telegram-format.js'
import { TelegramPaymentsService } from './telegram-payments.service.js'

/** The admin panel's "Tasa BCV" section (frontend ADMIN_ROUTES.exchangeRate). */
const EXCHANGE_RATE_PANEL_PATH = '/admin/tasa-bcv'

/**
 * Order, rate-sync and contact form events → Telegram. Listeners run asynchronously after the change was
 * committed and never throw: a Telegram outage can never fail or slow down the customer's
 * request (or the rate sync).
 */
@Injectable()
export class TelegramEventsListener {
    private readonly logger = new Logger('TelegramEvents')

    constructor(
        private readonly telegram: TelegramBotService,
        private readonly payments: TelegramPaymentsService,
        private readonly contact: TelegramContactService,
    ) {}

    @OnEvent(ORDER_EVENTS.paymentSubmitted, { async: true })
    async onPaymentSubmitted(event: OrderPaymentSubmittedEvent): Promise<void> {
        if (!this.telegram.enabled) return
        await this.safely(`payment of ${event.code}`, () =>
            this.payments.notifyPaymentSubmitted(event.paymentId),
        )
    }

    @OnEvent(ORDER_EVENTS.created, { async: true })
    async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
        if (!this.telegram.enabled) return
        await this.safely(`new order ${event.code}`, () =>
            this.payments.notifyOrderCreated(event.orderId),
        )
    }

    /**
     * A payment under verification was handled from the web (or the order was cancelled): the
     * Telegram copies lose their buttons and say who did it. Moves made from Telegram update
     * the messages themselves (they know the chat's name).
     */
    @OnEvent(ORDER_EVENTS.statusChanged, { async: true })
    async onStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
        if (!this.telegram.enabled) return
        if (event.from !== 'PENDIENTE_VERIFICACION' || event.actor === 'telegram') return
        await this.safely(`status change of ${event.code}`, async () => {
            const paymentIds = await this.payments.unresolvedPaymentIds(event.orderId)
            if (!paymentIds.length) return
            const name = await this.payments.userName(event.actorUserId)
            const resolution = webResolution(event, name)
            for (const paymentId of paymentIds) {
                await this.payments.resolvePayment(
                    paymentId,
                    resolution,
                    event.to === 'PAGO_RECHAZADO'
                        ? { whatsapp: { issuedById: event.actorUserId } }
                        : {},
                )
            }
        })
    }

    /** The automatic rate sync kept failing: the admins can load the rate by hand. */
    @OnEvent(EXCHANGE_RATE_EVENTS.syncFailing, { async: true })
    async onRateSyncFailing(event: RateSyncFailingEvent): Promise<void> {
        if (!this.telegram.enabled) return
        await this.safely('rate sync failing', async () => {
            await this.payments.broadcast(rateSyncFailingMessage(event), EXCHANGE_RATE_PANEL_PATH)
        })
    }

    @OnEvent(EXCHANGE_RATE_EVENTS.syncRecovered, { async: true })
    async onRateSyncRecovered(event: RateSyncRecoveredEvent): Promise<void> {
        if (!this.telegram.enabled) return
        await this.safely('rate sync recovered', async () => {
            await this.payments.broadcast(rateSyncRecoveredMessage(event), EXCHANGE_RATE_PANEL_PATH)
        })
    }

    /** The contact form was accepted (it checked a chat could receive it). */
    @OnEvent(CONTACT_EVENTS.messageReceived, { async: true })
    async onContactMessage(event: ContactMessageReceivedEvent): Promise<void> {
        await this.safely('contact message', async () => {
            const delivered = await this.contact.notify(event)
            if (!delivered) {
                this.logger.error(
                    `Contact message from ${event.email} (${event.topic}) reached no Telegram chat`,
                )
            }
        })
    }

    private async safely(what: string, work: () => Promise<void>): Promise<void> {
        try {
            await work()
        } catch (error) {
            this.logger.error(
                `Telegram notification (${what}) failed: ${this.telegram.describe(error)}`,
            )
        }
    }
}

/** The line appended to the Telegram copies when the web handled the payment. */
export function webResolution(event: OrderStatusChangedEvent, name: string | null): string {
    const by = name ? ` por ${escapeHtml(name)}` : ''
    const at = formatCaracasTime(new Date(event.changedAt))
    const note = event.note ? `\nMotivo: ${escapeHtml(truncate(event.note, 300))}` : ''
    switch (event.to) {
        case 'PAGO_VERIFICADO':
            return `✅ <b>Pago confirmado</b>${by} desde el panel · ${at}`
        case 'PAGO_RECHAZADO':
            return `❌ <b>Pago rechazado</b>${by} desde el panel · ${at}${note}`
        case 'CANCELADO':
            return `🚫 <b>Pedido cancelado</b>${by} desde el panel · ${at}${note}`
        default:
            return `ℹ️ Pedido actualizado${by} desde el panel · ${at}`
    }
}
