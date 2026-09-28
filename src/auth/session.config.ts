import type { JwtClaims, SessionToken } from '../common/types/auth-user.js'
import type { ConfigService } from '@nestjs/config'
import type { Env } from '../config/env.schema.js'

/**
 * Extra seconds the token/cookie outlives the idle limit plus the prompt countdown, so the
 * server session never expires while the "extend session?" prompt is still on screen
 * (clock drift, a slow request, a throttled background tab).
 */
export const SESSION_EXPIRY_MARGIN_SECONDS = 60

/** Timing of the admin session, resolved from the environment. */
export interface SessionSettings {
    idleMinutes: number
    promptSeconds: number
    /** Token and cookie lifetime: idle limit + prompt countdown + margin. */
    ttlSeconds: number
}

export function resolveSessionSettings(
    env: Pick<Env, 'SESSION_IDLE_MINUTES' | 'SESSION_PROMPT_SECONDS'>,
): SessionSettings {
    const idleMinutes = env.SESSION_IDLE_MINUTES
    const promptSeconds = env.SESSION_PROMPT_SECONDS
    return {
        idleMinutes,
        promptSeconds,
        ttlSeconds: idleMinutes * 60 + promptSeconds + SESSION_EXPIRY_MARGIN_SECONDS,
    }
}

/** Same as `resolveSessionSettings`, reading the validated environment from Nest's config. */
export function sessionSettingsFrom(config: ConfigService<Env, true>): SessionSettings {
    return resolveSessionSettings({
        SESSION_IDLE_MINUTES: config.get('SESSION_IDLE_MINUTES', { infer: true }),
        SESSION_PROMPT_SECONDS: config.get('SESSION_PROMPT_SECONDS', { infer: true }),
    })
}

/**
 * Lifetime of verified or freshly signed claims. Returns `null` when the token has no expiry
 * or outlives the configured lifetime (e.g. a 7-day token issued before the idle timeout
 * existed), so such tokens are rejected instead of bypassing the timeout.
 */
export function tokenLifetime(claims: JwtClaims, ttlSeconds: number): SessionToken | null {
    if (typeof claims.exp !== 'number' || typeof claims.iat !== 'number') return null
    if (claims.exp - claims.iat > ttlSeconds) return null
    return { issuedAt: new Date(claims.iat * 1000), expiresAt: new Date(claims.exp * 1000) }
}

/**
 * When a password change takes effect: the next whole second after `now`. Every token signed
 * so far has an `iat` (whole seconds, rounded down) before it, so they are all rejected, even
 * one signed in the same second as the change.
 */
export function passwordChangeInstant(now: Date = new Date()): Date {
    return new Date((Math.floor(now.getTime() / 1000) + 1) * 1000)
}

/** True when a token signed at `iat` (seconds) predates the user's last password change. */
export function issuedBeforePasswordChange(iat: number, passwordChangedAt: Date | null): boolean {
    return passwordChangedAt !== null && iat * 1000 < passwordChangedAt.getTime()
}

/**
 * `iat` for a new token: now, but never before the user's last password change. Right after a
 * change (`passwordChangeInstant` is up to one second ahead) the token is dated at the change,
 * so the session that made it stays valid while every older one dies.
 */
export function sessionIssuedAt(
    passwordChangedAt: Date | null,
    nowMs: number = Date.now(),
): number {
    const now = Math.floor(nowMs / 1000)
    if (!passwordChangedAt) return now
    return Math.max(now, Math.ceil(passwordChangedAt.getTime() / 1000))
}
