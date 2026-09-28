import { createHmac, randomInt } from 'node:crypto'

export const LINK_CODE_TTL_MS = 10 * 60_000
export const LINK_CODE_PATTERN = /^\d{6}$/

/** A random 6-digit code ("004821"). */
export function generateLinkCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * HMAC-SHA-256 of the code with a server secret. A plain hash of 6 digits could be reversed by
 * trying the million values; without the secret the stored hashes reveal nothing.
 */
export function hashLinkCode(code: string, secret: string): string {
    return createHmac('sha256', secret).update(`telegram-link:${code}`).digest('hex')
}
