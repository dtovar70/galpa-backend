import { BadRequestException, ConflictException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { QueryFailedError } from 'typeorm'
import type { CreateOrderDto } from './dto/create-order.dto.js'

/**
 * Checkout retries (`POST /api/orders` with an `Idempotency-Key` header). The storefront sends
 * one random key (a UUID) per checkout attempt and repeats it when it retries after a network
 * error or a double click:
 *
 * - First time: the order is created and stores the key with a hash of the request body.
 * - Same key, same body, within 24 h: nothing is created again (no stock is taken); the answer
 *   is 200 with the same order, `replayed: true` and a NEW `accessToken` (only token hashes are
 *   stored, so the first token cannot be returned again; both open the order).
 * - Same key, different body: 409 `IDEMPOTENCY_KEY_REUSED`.
 * - Key older than 24 h: freed, and the request creates a new order.
 * - No header: every request creates an order, as before.
 */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key'
/** UUIDs and similar random ids: 16–64 letters, digits and dashes. */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9-]{16,64}$/
export const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60_000
export const IDEMPOTENCY_KEY_REUSED = 'IDEMPOTENCY_KEY_REUSED'
/** Unique index on `orders.idempotency_key` (see the OrderIdempotencyKeys migration). */
export const IDEMPOTENCY_KEY_INDEX = 'orders_idempotency_key_key'

/** The validated header value; undefined when it was not sent (or sent empty). */
export function parseIdempotencyKey(raw: string | undefined): string | undefined {
    const key = raw?.trim()
    if (!key) return undefined
    if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
        const message = 'El identificador del intento de compra no es válido. Recarga la página.'
        throw new BadRequestException({
            statusCode: 400,
            error: 'Bad Request',
            message,
            details: [{ field: 'Idempotency-Key', errors: [message] }],
        })
    }
    return key
}

export function idempotencyKeyReused(): ConflictException {
    return new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: IDEMPOTENCY_KEY_REUSED,
        message:
            'Este intento de compra ya se usó con otros datos. Recarga la página e intenta de nuevo.',
    })
}

/** JSON with sorted keys and without `undefined`, so equal values always serialize the same. */
export function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`
    if (value !== null && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([, entry]) => entry !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`
    }
    return JSON.stringify(value) ?? 'null'
}

/**
 * SHA-256 of the checkout body as validated (trimmed by the DTO), with the email lowercased and
 * missing notes as "", like the order stores them. Line order matters (it is the order's).
 */
export function checkoutRequestHash(dto: CreateOrderDto): string {
    const normalized = { ...dto, email: dto.email.toLowerCase(), notes: dto.notes ?? '' }
    return createHash('sha256').update(canonicalJson(normalized)).digest('hex')
}

/** True when `error` is the unique violation of another order holding the same key. */
export function isIdempotencyKeyConflict(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false
    const driverError = error.driverError as { code?: unknown; constraint?: unknown } | undefined
    return driverError?.code === '23505' && driverError.constraint === IDEMPOTENCY_KEY_INDEX
}
