import { Injectable, UnauthorizedException } from '@nestjs/common'
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
import { sessionSettingsFrom, tokenLifetime, type SessionSettings } from './session.config.js'

const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos.'

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

    async validateCredentials(email: string, password: string): Promise<AuthUser> {
        const user = await this.users
            .createQueryBuilder('user')
            .addSelect('user.passwordHash')
            .where('user.email = :email', { email: email.trim().toLowerCase() })
            .getOne()

        this.dummyHash ??= argon2.hash('manada-russo-timing-guard')
        const hash = user?.passwordHash ?? (await this.dummyHash)
        const valid = await argon2.verify(hash, password).catch(() => false)

        if (!user || !valid) {
            throw new UnauthorizedException(INVALID_CREDENTIALS)
        }

        return toAuthUser(user)
    }

    /** Signs a new session token (idle limit + prompt + margin) and returns its lifetime. */
    async createSession(user: AuthUser): Promise<SessionToken & { token: string }> {
        const payload: JwtPayload = { sub: user.id, role: user.role }
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
}
