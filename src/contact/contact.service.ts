import {
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { fieldError } from '../auth/auth.service.js'
import { ContactOptionsService } from '../catalogs/contact-options.service.js'
import { MobilePrefixesService } from '../catalogs/mobile-prefixes.service.js'
import type { Env } from '../config/env.schema.js'
import { ContentService } from '../content/content.service.js'
import { msg } from '../common/validation/messages.js'
import { MailService } from '../mail/mail.service.js'
import { Product } from '../products/entities/product.entity.js'
import { TelegramContactService } from '../telegram/telegram-contact.service.js'
import { SlidingWindowLimiter } from '../telegram/rate-limiter.js'
import { contactInboxEmail } from './contact-email.js'
import {
    CONTACT_FIELD,
    CONTACT_EMAIL_LIMIT,
    CONTACT_TOO_MANY,
    CONTACT_UNAVAILABLE,
    CONTACT_UNAVAILABLE_MESSAGE,
    CONTACT_WINDOW_MS,
} from './contact.constants.js'
import { CONTACT_EVENTS, type ContactMessageReceivedEvent } from './contact.events.js'
import type { ContactMessageDto } from './dto/contact-message.dto.js'

/**
 * The storefront's contact / advisory form. Messages go to the owner's linked Telegram chats
 * (through the `contact.message_received` event) and to the store's inbox (the contact email of
 * the site content, with the customer as reply-to); nothing is stored. When neither can receive
 * them the customer gets a 503 and the WhatsApp fallback, never a false "sent".
 */
@Injectable()
export class ContactService {
    private readonly logger = new Logger('Contact')
    private readonly emailLimiter = new SlidingWindowLimiter(CONTACT_EMAIL_LIMIT, CONTACT_WINDOW_MS)
    private readonly siteUrl: string

    constructor(
        private readonly telegram: TelegramContactService,
        private readonly mobilePrefixes: MobilePrefixesService,
        private readonly options: ContactOptionsService,
        private readonly content: ContentService,
        private readonly mail: MailService,
        @InjectRepository(Product) private readonly products: Repository<Product>,
        private readonly events: EventEmitter2,
        config: ConfigService<Env, true>,
    ) {
        this.siteUrl = config.get('PUBLIC_SITE_URL', { infer: true })
    }

    /**
     * Accepts a message: 400 for a topic or space type that is not active in the catalog or a
     * WhatsApp on an inactive operator code, 503 while neither
     * Telegram nor the inbox can receive it, 429 past 3 messages per email every 15 minutes. A
     * filled honeypot is answered like a success and dropped.
     */
    async submit(dto: ContactMessageDto): Promise<void> {
        if (dto.website) {
            this.logger.log('Contact form honeypot filled; message dropped')
            return
        }
        // The DTO checked the shape of the codes; they must be active options of the catalog.
        const topicLabel = await this.options.activeLabel('topics', dto.topic)
        if (topicLabel === null) throw fieldError('topic', msg.invalid(CONTACT_FIELD.topic))
        const spaceTypeLabel = dto.spaceType
            ? await this.options.activeLabel('spaceTypes', dto.spaceType)
            : null
        if (dto.spaceType && spaceTypeLabel === null) {
            throw fieldError('spaceType', msg.invalid(CONTACT_FIELD.spaceType))
        }
        if (dto.phone) {
            // The DTO checked the shape ("0424-1234567"); the operator code must be active.
            const phoneProblem = await this.mobilePrefixes.phoneProblem(dto.phone)
            if (phoneProblem) throw fieldError('phone', phoneProblem)
        }
        const content = await this.content.getAll()
        const inbox = content.contact.email.trim()
        const byEmail = this.mail.delivers && inbox !== ''
        const byTelegram = await this.telegram.canDeliver()
        if (!byTelegram && !byEmail) {
            this.logger.warn(
                'Contact message refused: no active Telegram chat and no mail delivery to the store inbox',
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

        const product = dto.productSlug
            ? await this.products.findOne({
                  where: { slug: dto.productSlug },
                  select: { slug: true, name: true },
              })
            : null
        const event: ContactMessageReceivedEvent = {
            // The DTO requires one of them.
            fullName: (dto.name ?? dto.fullName) as string,
            email: dto.email,
            phone: dto.phone ?? null,
            topic: dto.topic,
            topicLabel,
            spaceType: dto.spaceType ?? null,
            spaceTypeLabel,
            areaM2: dto.areaM2 ?? null,
            product: product
                ? {
                      slug: product.slug,
                      name: product.name,
                      url: `${this.siteUrl}/producto/${encodeURIComponent(product.slug)}`,
                  }
                : null,
            message: dto.message,
            receivedAt: new Date().toISOString(),
        }
        if (byTelegram) this.events.emit(CONTACT_EVENTS.messageReceived, event)
        if (byEmail) {
            const email = contactInboxEmail(event, {
                brandName: content.general.brandName,
                contact: content.contact,
            })
            // Never throws (failures are logged); the customer does not wait for the provider.
            void this.mail.send(
                { to: inbox, replyTo: event.email, ...email },
                `contact message (${event.topic})`,
            )
        }
    }
}
