import {
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { fieldError } from '../auth/auth.service.js'
import { MobilePrefixesService } from '../catalogs/mobile-prefixes.service.js'
import { TelegramContactService } from '../telegram/telegram-contact.service.js'
import { SlidingWindowLimiter } from '../telegram/rate-limiter.js'
import {
    CONTACT_EMAIL_LIMIT,
    CONTACT_TOO_MANY,
    CONTACT_UNAVAILABLE,
    CONTACT_UNAVAILABLE_MESSAGE,
    CONTACT_WINDOW_MS,
} from './contact.constants.js'
import { CONTACT_EVENTS, type ContactMessageReceivedEvent } from './contact.events.js'
import type { ContactMessageDto } from './dto/contact-message.dto.js'

/**
 * The storefront's contact form. Messages go to the owner's linked Telegram chats (through the
 * `contact.message_received` event); nothing is stored. When no chat can receive them the
 * customer gets a 503 and the WhatsApp fallback, never a false "sent".
 */
@Injectable()
export class ContactService {
    private readonly logger = new Logger('Contact')
    private readonly emailLimiter = new SlidingWindowLimiter(CONTACT_EMAIL_LIMIT, CONTACT_WINDOW_MS)

    constructor(
        private readonly telegram: TelegramContactService,
        private readonly mobilePrefixes: MobilePrefixesService,
        private readonly events: EventEmitter2,
    ) {}

    /**
     * Accepts a message: 400 for a WhatsApp on an inactive operator code, 503 while Telegram
     * cannot deliver it, 429 past 3 messages per email every 15 minutes. A filled honeypot is
     * answered like a success and dropped.
     */
    async submit(dto: ContactMessageDto): Promise<void> {
        if (dto.website) {
            this.logger.log('Contact form honeypot filled; message dropped')
            return
        }
        if (dto.phone) {
            // The DTO checked the shape ("0424-1234567"); the operator code must be active.
            const phoneProblem = await this.mobilePrefixes.phoneProblem(dto.phone)
            if (phoneProblem) throw fieldError('phone', phoneProblem)
        }
        if (!(await this.telegram.canDeliver())) {
            this.logger.warn(
                'Contact message refused: the Telegram bot is off or has no active linked chat',
            )
            throw new ServiceUnavailableException({
                statusCode: 503,
                error: 'Service Unavailable',
                code: CONTACT_UNAVAILABLE,
                message: CONTACT_UNAVAILABLE_MESSAGE,
            })
        }
        if (!this.emailLimiter.hit(dto.email.trim().toLowerCase())) {
            throw new HttpException(CONTACT_TOO_MANY, HttpStatus.TOO_MANY_REQUESTS)
        }

        const event: ContactMessageReceivedEvent = {
            fullName: dto.fullName,
            email: dto.email,
            phone: dto.phone ?? null,
            topic: dto.topic,
            message: dto.message,
            receivedAt: new Date().toISOString(),
        }
        this.events.emit(CONTACT_EVENTS.messageReceived, event)
    }
}
