import {
    HttpException,
    HttpStatus,
    Inject,
    Injectable,
    Logger,
    type OnApplicationShutdown,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import argon2 from 'argon2'
import { IsNull, MoreThan, Repository } from 'typeorm'
import type { Env } from '../../config/env.schema.js'
import { newId } from '../../database/id.js'
import { SlidingWindowLimiter } from '../../telegram/rate-limiter.js'
import { fieldError } from '../auth.service.js'
import { PasswordResetCode } from '../entities/password-reset-code.entity.js'
import { User } from '../entities/user.entity.js'
import { passwordChangeInstant } from '../session.config.js'
import {
    PASSWORD_RESET_CHANNEL_LIST,
    type PasswordResetChannel,
    type PasswordResetRecipient,
} from './password-reset.channel.js'
import {
    generateResetCode,
    hashResetCode,
    RESET_CODE_MAX_ATTEMPTS,
    RESET_CODE_PATTERN,
    RESET_CODE_TTL_MS,
    resetCodeHashesMatch,
} from './reset-code.js'

/** The answer to every request, whether or not the account exists or can be reached. */
export const PASSWORD_RESET_REQUESTED =
    'Si el correo pertenece a una cuenta activa, te enviamos un código de 6 dígitos por Telegram (si lo tienes vinculado) o a tu correo. Vence en 10 minutos.'
export const PASSWORD_RESET_INVALID_CODE = 'Código inválido o vencido.'
export const PASSWORD_RESET_TOO_MANY =
    'Hiciste muchas solicitudes seguidas. Espera unos minutos e intenta de nuevo.'

/** Requests per email: 3 every 15 minutes (the IP limit lives on the route). */
const EMAIL_LIMIT = 3
const EMAIL_WINDOW_MS = 15 * 60_000
/** User id hashed against when there is no account, so both paths do the same work. */
const NO_USER = 'no-user'

/**
 * "¿Olvidaste tu contraseña?" for panel users, through a delivery channel (a linked Telegram
 * chat first, email as the fallback). Nothing here tells whether an email belongs to an account:
 *
 * - `request` answers at once with the same body; the lookup, the code and the delivery run
 *   in the background, so the response time does not depend on the account either.
 * - `confirm` answers every wrong, used, burned or expired code (or unknown email) with the
 *   same "Código inválido o vencido."; only password policy problems are field errors (they
 *   are checked by the DTO before any lookup).
 */
@Injectable()
export class PasswordResetService implements OnApplicationShutdown {
    private readonly logger = new Logger('PasswordReset')
    private readonly secret: string
    private readonly emailLimiter = new SlidingWindowLimiter(EMAIL_LIMIT, EMAIL_WINDOW_MS)
    /** Background requests still running (awaited on shutdown and by tests). */
    private readonly pending = new Set<Promise<void>>()

    constructor(
        @InjectRepository(User) private readonly users: Repository<User>,
        @InjectRepository(PasswordResetCode)
        private readonly codes: Repository<PasswordResetCode>,
        @Inject(PASSWORD_RESET_CHANNEL_LIST)
        private readonly channels: readonly PasswordResetChannel[],
        config: ConfigService<Env, true>,
    ) {
        this.secret = config.get('JWT_SECRET', { infer: true })
    }

    async onApplicationShutdown(): Promise<void> {
        await this.idle()
    }

    /** Resolves once every background request finished. */
    async idle(): Promise<void> {
        while (this.pending.size) await Promise.allSettled(this.pending)
    }

    /**
     * Accepts a reset request. Throws 429 when this email asked too often (the same for any
     * email, so it tells nothing); otherwise the work continues in the background.
     */
    request(email: string, requesterIp: string | null): void {
        const normalized = email.trim().toLowerCase()
        if (!this.emailLimiter.hit(normalized)) {
            throw new HttpException(PASSWORD_RESET_TOO_MANY, HttpStatus.TOO_MANY_REQUESTS)
        }
        const work = this.issue(normalized, requesterIp)
            .catch((error: unknown) => {
                this.logger.error(
                    `Password reset request failed: ${error instanceof Error ? error.message : String(error)}`,
                )
            })
            .finally(() => this.pending.delete(work))
        this.pending.add(work)
    }

    private async activeUser(email: string): Promise<User | null> {
        const user = await this.users
            .createQueryBuilder('user')
            .where('LOWER(user.email) = :email', { email })
            .getOne()
        return user?.isActive ? user : null
    }

    private async issue(email: string, requesterIp: string | null): Promise<void> {
        const user = await this.activeUser(email)
        if (!user) {
            this.logger.log('Password reset requested for an unknown or inactive account')
            return
        }
        const recipient = toRecipient(user)
        const channel = await this.firstReachable(recipient)
        if (!channel) {
            this.logger.warn(
                `Password reset for user ${user.id} not sent: no channel can reach them (no active linked Telegram chat or the bot is off, and mail is off)`,
            )
            return
        }

        const now = new Date()
        // Only the newest code works: the previous unused ones expire now.
        await this.codes.update(
            { userId: user.id, usedAt: IsNull(), expiresAt: MoreThan(now) },
            { expiresAt: now },
        )
        const code = generateResetCode()
        await this.codes.insert({
            id: newId(),
            userId: user.id,
            codeHash: hashResetCode(code, user.id, this.secret),
            channel: channel.id,
            expiresAt: new Date(now.getTime() + RESET_CODE_TTL_MS),
            attempts: 0,
            usedAt: null,
            createdAt: now,
            requesterIp: requesterIp ? requesterIp.slice(0, 64) : null,
        })
        const delivered = await channel.sendCode(recipient, code, RESET_CODE_TTL_MS / 60_000)
        if (delivered === 0) {
            this.logger.warn(`Password reset code for user ${user.id} could not be delivered`)
        } else {
            this.logger.log(`Password reset code sent to user ${user.id} via ${channel.id}`)
        }
    }

    private async firstReachable(
        user: PasswordResetRecipient,
    ): Promise<PasswordResetChannel | null> {
        for (const channel of this.channels) {
            if (await channel.canReach(user)) return channel
        }
        return null
    }

    /**
     * Checks the code and sets the new password. Every attempt is counted before the
     * comparison (atomically), so parallel guesses cannot exceed the limit. On success the
     * password change instant rejects every existing session (no auto-login).
     */
    async confirm(email: string, code: string, newPassword: string): Promise<void> {
        const user = await this.activeUser(email.trim().toLowerCase())
        // The same queries run for an unknown email (against ids that never exist).
        const latest = await this.codes.findOne({
            where: {
                userId: user?.id ?? NO_USER,
                usedAt: IsNull(),
                expiresAt: MoreThan(new Date()),
            },
            order: { createdAt: 'DESC' },
        })
        const claimed = await this.claimAttempt(latest?.id ?? NO_USER)
        const presented = hashResetCode(
            RESET_CODE_PATTERN.test(code) ? code : '',
            user?.id ?? NO_USER,
            this.secret,
        )
        const matches = resetCodeHashesMatch(presented, claimed?.codeHash ?? null)
        if (!user || !latest || !claimed || !matches || !RESET_CODE_PATTERN.test(code)) {
            throw fieldError('code', PASSWORD_RESET_INVALID_CODE)
        }

        const now = new Date()
        const burned = await this.codes.update({ id: latest.id, usedAt: IsNull() }, { usedAt: now })
        if (!burned.affected) throw fieldError('code', PASSWORD_RESET_INVALID_CODE)

        await this.users.update(
            { id: user.id },
            {
                passwordHash: await argon2.hash(newPassword),
                passwordChangedAt: passwordChangeInstant(),
            },
        )
        this.logger.log(`Password of user ${user.id} reset with a ${latest.channel} code`)

        const channel = this.channels.find((candidate) => candidate.id === latest.channel)
        if (channel) {
            await channel.sendPasswordChanged(toRecipient(user)).catch((error: unknown) => {
                this.logger.warn(
                    `Could not send the password-changed notice to user ${user.id}: ${error instanceof Error ? error.message : String(error)}`,
                )
            })
        }
    }

    /**
     * Counts one attempt on a live code (unused, unexpired, under the limit) and returns its
     * hash; null when the code cannot be used any more. One statement, so it is atomic.
     */
    private async claimAttempt(id: string): Promise<{ codeHash: string } | null> {
        const rows = (await this.codes.query(
            `WITH claimed AS (
                UPDATE "password_reset_codes" SET "attempts" = "attempts" + 1
                WHERE "id" = $1 AND "used_at" IS NULL AND "expires_at" > now() AND "attempts" < $2
                RETURNING "code_hash"
            ) SELECT "code_hash" AS "codeHash" FROM claimed`,
            [id, RESET_CODE_MAX_ATTEMPTS],
        )) as { codeHash: string }[]
        return rows[0] ?? null
    }
}

function toRecipient(user: User): PasswordResetRecipient {
    return { id: user.id, name: user.name, email: user.email }
}
