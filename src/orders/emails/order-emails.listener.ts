import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import {
    ORDER_EVENTS,
    type OrderCreatedEvent,
    type OrderStatusChangedEvent,
} from '../orders.events.js'
import { isStatusEmailStatus } from './order-emails.js'
import { OrderEmailsService } from './order-emails.service.js'

/**
 * Customer emails driven by order events: order.created → "Pedido recibido"; order.status_changed
 * → one email per status the customer should hear about (payment approved or rejected, goods
 * on their way, ready for pickup, shipped, delivered, cancelled, expired). They run after the
 * change was committed and never throw: a mail outage can never fail or slow down an order. With
 * MAIL_DRIVER=log they do nothing.
 */
@Injectable()
export class OrderEmailsListener {
    private readonly logger = new Logger('OrderEmails')

    constructor(private readonly emails: OrderEmailsService) {}

    @OnEvent(ORDER_EVENTS.created, { async: true })
    async onOrderCreated(event: OrderCreatedEvent): Promise<void> {
        if (!this.emails.enabled) return
        try {
            await this.emails.sendOrderReceived(event.orderId)
        } catch (error) {
            this.logger.error(`"Order received" email of ${event.code} failed: ${reason(error)}`)
        }
    }

    @OnEvent(ORDER_EVENTS.statusChanged, { async: true })
    async onStatusChanged(event: OrderStatusChangedEvent): Promise<void> {
        if (!this.emails.enabled || !isStatusEmailStatus(event.to)) return
        try {
            await this.emails.sendStatusChanged(event.orderId, event.to, event.note)
        } catch (error) {
            this.logger.error(
                `Status email (${event.to}) of ${event.code} failed: ${reason(error)}`,
            )
        }
    }
}

function reason(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
