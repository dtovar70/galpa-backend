import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js'

/**
 * Request headers the storefront (another origin) may send. Listed explicitly instead of
 * reflecting whatever a preflight asks for: `Content-Type` (JSON bodies), `Accept`, and
 * `Idempotency-Key` (checkout retries, see order-idempotency.ts).
 */
export const CORS_ALLOWED_HEADERS = ['Content-Type', 'Accept', 'Idempotency-Key']

/** CORS for the storefront's origins, with the session cookie (credentials). */
export function corsOptions(origins: string[]): CorsOptions {
    return {
        origin: origins,
        credentials: true,
        allowedHeaders: CORS_ALLOWED_HEADERS,
        // Browsers cache the preflight for this long (Chrome caps it at 2 hours).
        maxAge: 600,
    }
}
