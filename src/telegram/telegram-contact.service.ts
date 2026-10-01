import { Injectable } from '@nestjs/common'
import { InlineKeyboard } from 'grammy'
import type { ContactMessageReceivedEvent } from '../contact/contact.events.js'
import { toWhatsAppPhone, whatsAppUrl } from '../orders/whatsapp/whatsapp-template.js'
import { TelegramBotService } from './telegram-bot.service.js'
import { contactMessage, contactWhatsAppGreeting } from './telegram-format.js'
import { TelegramPaymentsService } from './telegram-payments.service.js'
import { TelegramStoreService } from './telegram-store.service.js'

/**
 * Contact form messages → every active linked chat. The contact module asks `canDeliver`
 * before accepting a message, so a customer is never told it was sent when nobody can read it.
 */
@Injectable()
export class TelegramContactService {
    constructor(
        private readonly telegram: TelegramBotService,
        private readonly store: TelegramStoreService,
        private readonly payments: TelegramPaymentsService,
    ) {}

    /** The bot is on and at least one linked chat is active. */
    async canDeliver(): Promise<boolean> {
        if (!this.telegram.api) return false
        return (await this.store.activeChats()).length > 0
    }

    /**
     * Sends the notice, with an "Abrir WhatsApp" button when the customer left a number.
     * Telegram only takes http(s) and tg: URL buttons (no mailto:), so the email stays in the
     * text, where Telegram links it. Resolves with how many chats got it.
     */
    async notify(event: ContactMessageReceivedEvent): Promise<number> {
        const api = this.telegram.api
        if (!api) return 0
        const chats = await this.store.activeChats()
        const text = contactMessage(event)
        const whatsapp = event.phone ? toWhatsAppPhone(event.phone) : null
        const keyboard = whatsapp
            ? new InlineKeyboard().url(
                  '💬 Abrir WhatsApp',
                  whatsAppUrl(whatsapp, contactWhatsAppGreeting(event.fullName)),
              )
            : undefined
        let delivered = 0
        for (const chat of chats) {
            const sent = await this.payments.deliver(chat.chatId, 'sendMessage', () =>
                api.sendMessage(chat.chatId, text, {
                    parse_mode: 'HTML',
                    reply_markup: keyboard,
                    link_preview_options: { is_disabled: true },
                }),
            )
            if (sent) delivered++
        }
        return delivered
    }
}
