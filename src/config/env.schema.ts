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

/** "pedidos@tienda.com" or "Manada Russo Creativa <pedidos@tienda.com>". */
const MAILBOX_PATTERN =
    /^(?:[^<>@]*<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/
const MAILBOX_MESSAGE = 'Use an address like "Name <pedidos@example.com>" or "pedidos@example.com"'

export const MAIL_DRIVERS = ['log', 'smtp', 'resend'] as const
export type MailDriver = (typeof MAIL_DRIVERS)[number]

/**
 * Unknown keys are stripped (z.object is not strict), so a leftover variable from an older
 * `.env` (e.g. the removed JWT_EXPIRES_IN) is ignored instead of breaking startup.
 */
export const envSchema = z
    .object({
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
        /**
         * Hours from the start of a rate's "fecha valor" (Caracas) during which checkout may use it.
         * The default, 24, ends at the close of the fecha valor day: the BCV publishes the next
         * business day's rate the afternoon before, so a newer rate should always be there by then.
         */
        EXCHANGE_RATE_MAX_AGE_HOURS: z.coerce.number().positive().max(720).default(24),
        /** How often the BCV rate is fetched (it is also fetched at startup). */
        EXCHANGE_RATE_SYNC_INTERVAL_MINUTES: z.coerce.number().positive().max(1440).default(120),
        /**
         * Background jobs (rate sync, order expiry). Default: on, except under NODE_ENV=test so the
         * test suites never reach the network or the scheduler.
         */
        SCHEDULED_JOBS_ENABLED: optionalBoolean,
        /** Token of the Telegram bot (@BotFather). Without it the bot stays off. Never logged. */
        TELEGRAM_BOT_TOKEN: optionalString,
        /**
         * Turns the bot off even with a token. Default: on when a token exists, except under
         * NODE_ENV=test so the test suites never reach Telegram.
         */
        TELEGRAM_ENABLED: optionalBoolean,
        /** `polling` (default outside production) or `webhook` (default in production). */
        TELEGRAM_MODE: z.enum(['polling', 'webhook']).optional(),
        /**
         * Secret Telegram sends in `X-Telegram-Bot-Api-Secret-Token` on every webhook call. Required
         * in webhook mode; 1–256 characters of A-Z, a-z, 0-9, `_` and `-` (Telegram's rule).
         */
        TELEGRAM_WEBHOOK_SECRET: optionalString.pipe(
            z
                .string()
                .regex(/^[A-Za-z0-9_-]{1,256}$/, 'Use 1-256 characters: letters, digits, _ or -')
                .optional(),
        ),
        /** Bot API server (tests point it to a fake one). Default: https://api.telegram.org. */
        TELEGRAM_API_ROOT: z
            .url()
            .optional()
            .transform((value) => value?.replace(/\/+$/, '')),
        /**
         * How customer and password-reset emails leave the server: `log` (default: nothing is sent,
         * only the masked recipient and the subject are logged), `smtp` (e.g. Mailpit in development)
         * or `resend` (Resend's HTTP API, production). NODE_ENV=test always uses `log`.
         */
        MAIL_DRIVER: z.enum(MAIL_DRIVERS).default('log'),
        /** Sender of every email. Required by `smtp` and `resend`. */
        MAIL_FROM: optionalString.pipe(
            z.string().regex(MAILBOX_PATTERN, MAILBOX_MESSAGE).optional(),
        ),
        /** Where the customer's replies go (optional; without it, replies go to MAIL_FROM). */
        MAIL_REPLY_TO: optionalString.pipe(
            z.string().regex(MAILBOX_PATTERN, MAILBOX_MESSAGE).optional(),
        ),
        SMTP_HOST: optionalString,
        SMTP_PORT: optionalString.pipe(
            z.coerce.number<string>().int().min(1).max(65535).optional(),
        ),
        /** Optional: Mailpit needs no login. Set both or neither. Never logged. */
        SMTP_USER: optionalString,
        SMTP_PASS: optionalString,
        /** Resend API key ("re_…"). Required by `resend`. Never logged. */
        RESEND_API_KEY: optionalString,
    })
    .superRefine((env, ctx) => {
        const need = (key: keyof typeof env, why: string) => {
            if (env[key] === undefined) {
                ctx.addIssue({ code: 'custom', path: [key], message: `${key} is required ${why}` })
            }
        }
        if (env.MAIL_DRIVER === 'smtp') {
            need('MAIL_FROM', 'when MAIL_DRIVER=smtp')
            need('SMTP_HOST', 'when MAIL_DRIVER=smtp')
            need('SMTP_PORT', 'when MAIL_DRIVER=smtp')
            if (env.SMTP_USER !== undefined || env.SMTP_PASS !== undefined) {
                need('SMTP_USER', 'together with SMTP_PASS')
                need('SMTP_PASS', 'together with SMTP_USER')
            }
        }
        if (env.MAIL_DRIVER === 'resend') {
            need('MAIL_FROM', 'when MAIL_DRIVER=resend')
            need('RESEND_API_KEY', 'when MAIL_DRIVER=resend')
        }
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
