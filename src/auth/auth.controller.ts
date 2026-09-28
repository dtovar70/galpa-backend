import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Patch,
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
import { SESSION_COOKIE, toAuthUser } from './auth.constants.js'
import { AuthService } from './auth.service.js'
import { ChangePasswordDto } from './dto/change-password.dto.js'
import { LoginDto } from './dto/login.dto.js'
import { UpdateMeDto } from './dto/update-me.dto.js'
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

    /**
     * Signs a new token, sets it as the session cookie and returns the session body.
     * `passwordChangedAt`: the token is never dated before it (see `sessionIssuedAt`).
     */
    private async issueSession(
        user: AuthUser,
        res: Response,
        passwordChangedAt: Date | null = null,
    ): Promise<AuthSession> {
        const { token, ...lifetime } = await this.auth.createSession(user, passwordChangedAt)
        res.cookie(SESSION_COOKIE, token, {
            ...this.cookieOptions(),
            maxAge: Math.max(0, lifetime.expiresAt.getTime() - Date.now()),
        })
        return this.auth.toAuthSession(user, lifetime)
    }

    /**
     * Admin login. There is no public registration: users are created by the seed or by an
     * ADMIN (`/admin/users`). A deactivated account gets the same error as a wrong password.
     */
    @Public()
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(
        @Body() dto: LoginDto,
        @Res({ passthrough: true }) res: Response,
    ): Promise<AuthSession> {
        const user = await this.auth.validateCredentials(dto.email, dto.password)
        const session = await this.issueSession(toAuthUser(user), res, user.passwordChangedAt)
        await this.auth.recordLogin(user.id)
        return session
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
        return this.auth.toAuthSession(user, currentSession(request))
    }

    /** "Mi cuenta" (any role): change the display name. */
    @Patch('me')
    async updateMe(
        @CurrentUser() user: AuthUser,
        @Req() request: AuthenticatedRequest,
        @Body() dto: UpdateMeDto,
    ): Promise<AuthSession> {
        const updated = await this.auth.updateOwnName(user.id, dto.name)
        return this.auth.toAuthSession(updated, currentSession(request))
    }

    /**
     * "Mi cuenta" (any role): change the password. Every other session is closed; this one
     * gets a new cookie dated at the change, so it stays open. Throttled like login, since a
     * stolen session could try to guess the current password.
     */
    @Throttle({ default: { limit: 5, ttl: 60_000 } })
    @Post('me/password')
    @HttpCode(HttpStatus.OK)
    async changePassword(
        @CurrentUser() user: AuthUser,
        @Body() dto: ChangePasswordDto,
        @Res({ passthrough: true }) res: Response,
    ): Promise<AuthSession> {
        const { user: updated, passwordChangedAt } = await this.auth.changeOwnPassword(
            user.id,
            dto.currentPassword,
            dto.newPassword,
        )
        return this.issueSession(updated, res, passwordChangedAt)
    }
}

/** Lifetime of the token that authenticated the request (always set by JwtAuthGuard). */
function currentSession(request: AuthenticatedRequest) {
    if (!request.sessionToken) {
        throw new UnauthorizedException('Debes iniciar sesión para continuar.')
    }
    return request.sessionToken
}
