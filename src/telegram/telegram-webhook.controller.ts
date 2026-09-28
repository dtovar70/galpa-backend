import {
    BadRequestException,
    Controller,
    Headers,
    HttpCode,
    HttpStatus,
    Logger,
    NotFoundException,
    Post,
    Req,
    ServiceUnavailableException,
    UnauthorizedException,
} from '@nestjs/common'
import { SkipThrottle } from '@nestjs/throttler'
import type { Request } from 'express'
import type { Update } from 'grammy/types'
import { createHash, timingSafeEqual } from 'node:crypto'
import { Public } from '../common/decorators/public.decorator.js'
import { TelegramBotService } from './telegram-bot.service.js'
import { TELEGRAM_WEBHOOK_PATH } from './telegram.config.js'

/** Constant-time comparison of two secrets (hashed first so lengths never leak). */
export function secretMatches(received: string | undefined, expected: string): boolean {
    if (!received) return false
    const digest = (value: string) => createHash('sha256').update(value).digest()
    return timingSafeEqual(digest(received), digest(expected))
}

/**
 * Telegram's webhook (webhook mode only; 404 otherwise). Public and not throttled: Telegram
 * authenticates with the secret it was given in setWebhook, sent back in
 * `X-Telegram-Bot-Api-Secret-Token`.
 */
@Public()
@SkipThrottle()
@Controller(TELEGRAM_WEBHOOK_PATH)
export class TelegramWebhookController {
    private readonly logger = new Logger('TelegramWebhook')

    constructor(private readonly telegram: TelegramBotService) {}

    @Post()
    @HttpCode(HttpStatus.OK)
    async receive(
        @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
        @Req() req: Request,
    ): Promise<{ ok: true }> {
        const settings = this.telegram.settings
        if (!settings.enabled || settings.mode !== 'webhook' || !settings.webhookSecret) {
            throw new NotFoundException()
        }
        if (!secretMatches(secret, settings.webhookSecret)) throw new UnauthorizedException()
        const update = req.body as Update | undefined
        if (!update || typeof update !== 'object' || typeof update.update_id !== 'number') {
            throw new BadRequestException()
        }
        if (!this.telegram.bot?.isInited()) {
            // Not connected yet: Telegram retries the update later.
            throw new ServiceUnavailableException()
        }
        try {
            await this.telegram.handleWebhookUpdate(update)
        } catch (error) {
            // Answered 200 anyway: a retry would fail the same way and block the queue.
            this.logger.error(
                `Error handling update ${update.update_id}: ${this.telegram.describe(error)}`,
            )
        }
        return { ok: true }
    }
}
