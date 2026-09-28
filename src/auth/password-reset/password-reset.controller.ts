import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request } from 'express'
import { Public } from '../../common/decorators/public.decorator.js'
import { PasswordResetConfirmDto, PasswordResetRequestDto } from './dto/password-reset.dto.js'
import { PASSWORD_RESET_REQUESTED, PasswordResetService } from './password-reset.service.js'

const WINDOW_MS = 15 * 60_000

/**
 * "¿Olvidaste tu contraseña?" for panel users: a 6-digit code sent through a channel
 * (Telegram), then the new password. No session is created: the user logs in afterwards.
 */
@Controller('auth/password-reset')
export class PasswordResetController {
    constructor(private readonly resets: PasswordResetService) {}

    /** Always 202 with the same body (per IP: 3 every 15 minutes; per email: the same). */
    @Public()
    @Throttle({ default: { limit: 3, ttl: WINDOW_MS } })
    @Post('request')
    @HttpCode(HttpStatus.ACCEPTED)
    request(@Body() dto: PasswordResetRequestDto, @Req() req: Request): { message: string } {
        this.resets.request(dto.email, req.ip ?? null)
        return { message: PASSWORD_RESET_REQUESTED }
    }

    /** 204 once the password changed (per IP: 10 every 15 minutes). */
    @Public()
    @Throttle({ default: { limit: 10, ttl: WINDOW_MS } })
    @Post('confirm')
    @HttpCode(HttpStatus.NO_CONTENT)
    async confirm(@Body() dto: PasswordResetConfirmDto): Promise<void> {
        await this.resets.confirm(dto.email, dto.code, dto.newPassword)
    }
}
