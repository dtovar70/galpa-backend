import { Body, Controller, Header, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { Public } from '../common/decorators/public.decorator.js'
import { CONTACT_MESSAGE_SENT, CONTACT_WINDOW_MS } from './contact.constants.js'
import { ContactService } from './contact.service.js'
import { ContactMessageDto } from './dto/contact-message.dto.js'

/** Per client IP: 5 contact messages every 15 minutes. */
const CONTACT_IP_LIMIT = { default: { limit: 5, ttl: CONTACT_WINDOW_MS } }

@Public()
@Controller('contact')
export class ContactController {
    constructor(private readonly contact: ContactService) {}

    /**
     * "Escríbenos" / "Pide asesoría": 202 once the message is on its way to the owner's Telegram
     * and/or the store inbox. 503 (code `CONTACT_UNAVAILABLE`) when neither can receive it; 429
     * past 5 per IP or 3 per email every 15 minutes.
     */
    @Post()
    @HttpCode(HttpStatus.ACCEPTED)
    @Throttle(CONTACT_IP_LIMIT)
    @Header('Cache-Control', 'no-store')
    async send(@Body() dto: ContactMessageDto): Promise<{ message: string }> {
        await this.contact.submit(dto)
        return { message: CONTACT_MESSAGE_SENT }
    }
}
