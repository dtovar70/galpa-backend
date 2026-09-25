import { z } from 'zod'

/** "true"/"false" (and 1/0, yes/no) from the environment; unset or empty stays undefined. */
const optionalBoolean = z
    .enum(['true', 'false', '1', '0', 'yes', 'no', ''])
    .optional()
    .transform((value) => (value ? ['true', '1', 'yes'].includes(value) : undefined))

const optionalString = z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))

/**
 * Unknown keys are stripped (z.object is not strict), so a leftover variable from an older
 * `.env` (e.g. the removed JWT_EXPIRES_IN) is ignored instead of breaking startup.
 */
export const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    PUBLIC_API_URL: z
        .url()
        .default('http://localhost:3000')
        .transform((value) => value.replace(/\/+$/, '')),
    /**
     * Public address of the storefront, used to build the customer's order links
     * (`<PUBLIC_SITE_URL>/pedido/MR-000123?t=…`) the admin sends by WhatsApp.
     */
    PUBLIC_SITE_URL: z
        .url()
        .default('http://localhost:5173')
        .transform((value) => value.replace(/\/+$/, '')),
    CORS_ORIGIN: z
        .string()
        .default('http://localhost:5173')
        .transform((value) =>
            value
                .split(',')
                .map((origin) => origin.trim())
                .filter(Boolean),
        ),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
    /** Admin inactivity limit before the "extend session?" prompt shows up. */
    SESSION_IDLE_MINUTES: z.coerce.number().int().min(1).max(1440).default(30),
    /** Countdown of that prompt; the session closes when it reaches 0. */
    SESSION_PROMPT_SECONDS: z.coerce.number().int().min(5).max(600).default(30),
    CLOUDINARY_CLOUD_NAME: optionalString,
    CLOUDINARY_API_KEY: optionalString,
    CLOUDINARY_API_SECRET: optionalString,
    /** Hours a new order waits for its payment before it expires (fractions allowed). */
    ORDER_PAYMENT_WINDOW_HOURS: z.coerce.number().positive().max(720).default(24),
    /** How often unpaid orders past their deadline are expired. */
    ORDER_EXPIRY_INTERVAL_MINUTES: z.coerce.number().positive().max(1440).default(10),
    /** A BCV rate whose "fecha valor" is older than this cannot be used for checkout. */
    EXCHANGE_RATE_MAX_AGE_HOURS: z.coerce.number().positive().max(720).default(72),
    /** How often the BCV rate is fetched (it is also fetched at startup). */
    EXCHANGE_RATE_SYNC_INTERVAL_MINUTES: z.coerce.number().positive().max(1440).default(120),
    /**
     * Background jobs (rate sync, order expiry). Default: on, except under NODE_ENV=test so the
     * test suites never reach the network or the scheduler.
     */
    SCHEDULED_JOBS_ENABLED: optionalBoolean,
})

export type Env = z.infer<typeof envSchema>

/** Used by ConfigModule: fails fast at startup with a readable list of invalid variables. */
export function validateEnv(config: Record<string, unknown>): Env {
    const result = envSchema.safeParse(config)
    if (!result.success) {
        const issues = result.error.issues
            .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
            .join('\n')
        throw new Error(`Invalid environment variables:\n${issues}`)
    }
    return result.data
}
