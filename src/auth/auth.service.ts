import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import { InjectRepository } from '@nestjs/typeorm'
import argon2 from 'argon2'
import { Repository } from 'typeorm'
import type {
    AuthSession,
    AuthUser,
    JwtClaims,
    JwtPayload,
    SessionToken,
} from '../common/types/auth-user.js'
import type { Env } from '../config/env.schema.js'
import { toAuthUser } from './auth.constants.js'
import { User } from './entities/user.entity.js'
import {
    passwordChangeInstant,
    sessionIssuedAt,
    sessionSettingsFrom,
    tokenLifetime,
    type SessionSettings,
} from './session.config.js'

const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos.'
export const USER_NOT_FOUND = 'No encontramos ese usuario.'

/** A 400 with the usual `details` shape, pinned on one field of the form. */
export function fieldError(field: string, message: string): BadRequestException {
    return new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message,
        details: [{ field, errors: [message] }],
    })
}

/** The user's own account: login, sessions, "Mi cuenta". */
@Injectable()
export class AuthService {
    /** Hash verified when the email does not exist, so both paths take similar time. */
    private dummyHash?: Promise<string>
    readonly settings: SessionSettings

    constructor(
        @InjectRepository(User) private readonly users: Repository<User>,
        private readonly jwt: JwtService,
        config: ConfigService<Env, true>,
    ) {
        this.settings = sessionSettingsFrom(config)
    }

    /**
     * Unknown email, wrong password and deactivated account all get the same error after the
     * same argon2 work, so the answer never tells which accounts exist or are active.
     */
    async validateCredentials(email: string, password: string): Promise<User> {
        const user = await this.users
            .createQueryBuilder('user')
            .addSelect('user.passwordHash')
            .where('LOWER(user.email) = :email', { email: email.trim().toLowerCase() })
            .getOne()

        this.dummyHash ??= argon2.hash('manada-russo-timing-guard')
        const hash = user?.passwordHash ?? (await this.dummyHash)
        const valid = await argon2.verify(hash, password).catch(() => false)

        if (!user || !valid || !user.isActive) {
            throw new UnauthorizedException(INVALID_CREDENTIALS)
        }
        return user
    }

    /** Stamps the login time without touching `updated_at` (that one tracks profile edits). */
    async recordLogin(userId: string): Promise<void> {
        await this.users.query(`UPDATE "users" SET "last_login_at" = now() WHERE "id" = $1`, [
            userId,
        ])
    }

    /**
     * Signs a new session token (idle limit + prompt + margin) and returns its lifetime. It is
     * never dated before the user's last password change (see `sessionIssuedAt`).
     */
    async createSession(
        user: AuthUser,
        passwordChangedAt: Date | null = null,
    ): Promise<SessionToken & { token: string }> {
        const iat = sessionIssuedAt(passwordChangedAt)
        const payload: JwtPayload & { iat?: number } = { sub: user.id, role: user.role }
        // Only a token right after a password change needs an explicit (up to 1 s ahead) iat.
        if (iat > Math.floor(Date.now() / 1000)) payload.iat = iat
        const token = await this.jwt.signAsync(payload, { expiresIn: this.settings.ttlSeconds })
        const lifetime = tokenLifetime(this.jwt.decode<JwtClaims>(token), this.settings.ttlSeconds)
        if (!lifetime) throw new Error('Signed session token is missing its iat/exp claims')
        return { token, ...lifetime }
    }

    /** Response body shared by login, refresh and `me`. */
    toAuthSession(user: AuthUser, session: SessionToken): AuthSession {
        const { idleMinutes, promptSeconds, ttlSeconds } = this.settings
        return {
            ...user,
            session: {
                expiresAt: session.expiresAt.toISOString(),
                expiresInSeconds: Math.max(
                    0,
                    Math.floor((session.expiresAt.getTime() - Date.now()) / 1000),
                ),
                ttlSeconds,
                idleMinutes,
                promptSeconds,
            },
        }
    }

    /** "Mi cuenta": the user renames themselves. */
    async updateOwnName(userId: string, name: string): Promise<AuthUser> {
        await this.users.update({ id: userId }, { name })
        const user = await this.users.findOneBy({ id: userId })
        if (!user) throw new UnauthorizedException(USER_NOT_FOUND)
        return toAuthUser(user)
    }

    /**
     * "Mi cuenta": checks the current password and sets the new one. Returns the change
     * instant: the caller signs the new cookie with it, so this session survives and every
     * other one is rejected by JwtAuthGuard.
     */
    async changeOwnPassword(
        userId: string,
        currentPassword: string,
        newPassword: string,
    ): Promise<{ user: AuthUser; passwordChangedAt: Date }> {
        const user = await this.users
            .createQueryBuilder('user')
            .addSelect('user.passwordHash')
            .where('user.id = :id', { id: userId })
            .getOne()
        if (!user) throw new UnauthorizedException(USER_NOT_FOUND)

        const valid = await argon2.verify(user.passwordHash, currentPassword).catch(() => false)
        if (!valid) {
            // 400, not 401: a wrong current password must not look like an expired session.
            throw fieldError('currentPassword', 'La contraseña actual no es correcta.')
        }
        if (newPassword === currentPassword) {
            throw fieldError('newPassword', 'La nueva contraseña debe ser distinta de la actual.')
        }

        const passwordChangedAt = passwordChangeInstant()
        await this.users.update(
            { id: userId },
            { passwordHash: await argon2.hash(newPassword), passwordChangedAt },
        )
        return { user: toAuthUser(user), passwordChangedAt }
    }
}
