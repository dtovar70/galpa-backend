import { z } from 'zod'

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
