import { Injectable, Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { ORDER_EVENTS, type OrderCreatedEvent } from '../orders.events.js'
import { OrderEmailsService } from './order-emails.service.js'

/**
 * order.created → "Pedido recibido". Runs after the order was committed and never throws: a
 * mail outage can never fail or slow down the checkout. With MAIL_DRIVER=log it does nothing.
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
            this.logger.error(
                `"Order received" email of ${event.code} failed: ${error instanceof Error ? error.message : String(error)}`,
            )
        }
    }
}
