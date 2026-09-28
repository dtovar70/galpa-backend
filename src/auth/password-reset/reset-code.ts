import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

export const RESET_CODE_TTL_MS = 10 * 60_000
export const RESET_CODE_MAX_ATTEMPTS = 5
export const RESET_CODE_PATTERN = /^\d{6}$/

/** A random 6-digit code ("004821"). */
export function generateResetCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * HMAC-SHA-256 of the code with a server secret (like the Telegram link codes). The user id is
 * part of the message, so the same 6 digits never hash alike for two users, and a plain hash
 * of the million possible codes cannot be reversed without the secret.
 */
export function hashResetCode(code: string, userId: string, secret: string): string {
    return createHmac('sha256', secret).update(`password-reset:${userId}:${code}`).digest('hex')
}

/** Constant-time comparison of two hex hashes (false when either is malformed). */
export function resetCodeHashesMatch(presented: string, stored: string | null): boolean {
    const valid = (value: string | null): value is string =>
        typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
    const a = Buffer.from(valid(presented) ? presented : '0'.repeat(64), 'hex')
    const b = Buffer.from(valid(stored) ? stored : 'f'.repeat(64), 'hex')
    return timingSafeEqual(a, b) && valid(presented) && valid(stored)
}
