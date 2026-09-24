import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    Req,
    Res,
    UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Throttle } from '@nestjs/throttler'
import type { CookieOptions, Response } from 'express'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { Public } from '../common/decorators/public.decorator.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import type { AuthenticatedRequest, AuthSession, AuthUser } from '../common/types/auth-user.js'
import type { Env } from '../config/env.schema.js'
import { SESSION_COOKIE } from './auth.constants.js'
import { AuthService } from './auth.service.js'
import { LoginDto } from './dto/login.dto.js'
import { Role } from './role.enum.js'

@Controller('auth')
export class AuthController {
    constructor(
        private readonly auth: AuthService,
        private readonly config: ConfigService<Env, true>,
    ) {}

    private cookieOptions(): CookieOptions {
        return {
            httpOnly: true,
            sameSite: 'lax',
            secure: this.config.get('NODE_ENV', { infer: true }) === 'production',
            path: '/',
        }
    }

    /** Signs a new token, sets it as the session cookie and returns the session body. */
    private async issueSession(user: AuthUser, res: Response): Promise<AuthSession> {
        const { token, ...lifetime } = await this.auth.createSession(user)
        res.cookie(SESSION_COOKIE, token, {
            ...this.cookieOptions(),
            maxAge: Math.max(0, lifetime.expiresAt.getTime() - Date.now()),
        })
        return this.auth.toAuthSession(user, lifetime)
    }

    /** Admin login. There is no public registration: users are created by the seed. */
    @Public()
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(
        @Body() dto: LoginDto,
        @Res({ passthrough: true }) res: Response,
    ): Promise<AuthSession> {
        const user = await this.auth.validateCredentials(dto.email, dto.password)
        return this.issueSession(user, res)
    }

    /**
     * Extends the current session ("Sí, continuar" or background activity). Goes through the
     * global guards like any admin route: the token is verified and the user is re-read, so a
     * deleted user or a changed role is never re-issued a session.
     */
    @Roles(Role.ADMIN, Role.EDITOR)
    @Throttle({ default: { limit: 30, ttl: 60_000 } })
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    refresh(
        @CurrentUser() user: AuthUser,
        @Res({ passthrough: true }) res: Response,
    ): Promise<AuthSession> {
        return this.issueSession(user, res)
    }

    /** Public so an expired session can still clear its cookie. */
    @Public()
    @Post('logout')
    @HttpCode(HttpStatus.NO_CONTENT)
    logout(@Res({ passthrough: true }) res: Response): void {
        res.clearCookie(SESSION_COOKIE, this.cookieOptions())
    }

    @Get('me')
    me(@CurrentUser() user: AuthUser, @Req() request: AuthenticatedRequest): AuthSession {
        // Always set by JwtAuthGuard on authenticated routes.
        if (!request.sessionToken) {
            throw new UnauthorizedException('Debes iniciar sesión para continuar.')
        }
        return this.auth.toAuthSession(user, request.sessionToken)
    }
}
