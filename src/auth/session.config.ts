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
