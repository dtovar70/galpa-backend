import { envSchema, validateEnv } from './env.schema.js'

const BASE = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5440/db',
    JWT_SECRET: 'x'.repeat(32),
}

describe('envSchema', () => {
    it('defaults the admin session to 30 idle minutes and a 30-second prompt', () => {
        const env = validateEnv(BASE)
        expect(env.SESSION_IDLE_MINUTES).toBe(30)
        expect(env.SESSION_PROMPT_SECONDS).toBe(30)
    })

    it('coerces the session timings from strings', () => {
        const env = validateEnv({
            ...BASE,
            SESSION_IDLE_MINUTES: '1',
            SESSION_PROMPT_SECONDS: '10',
        })
        expect(env.SESSION_IDLE_MINUTES).toBe(1)
        expect(env.SESSION_PROMPT_SECONDS).toBe(10)
    })

    it('ignores a leftover JWT_EXPIRES_IN from an older .env', () => {
        const env = validateEnv({ ...BASE, JWT_EXPIRES_IN: '7d' })
        expect(env).not.toHaveProperty('JWT_EXPIRES_IN')
    })

    it('rejects invalid session timings', () => {
        expect(envSchema.safeParse({ ...BASE, SESSION_IDLE_MINUTES: '0' }).success).toBe(false)
        expect(envSchema.safeParse({ ...BASE, SESSION_PROMPT_SECONDS: 'abc' }).success).toBe(false)
        expect(() => validateEnv({ ...BASE, SESSION_PROMPT_SECONDS: '1' })).toThrow(
            /SESSION_PROMPT_SECONDS/,
        )
    })
})

describe('envSchema (orders and exchange rate)', () => {
    it('defaults the payment window, expiry, rate age and sync interval', () => {
        const env = validateEnv(BASE)
        expect(env.ORDER_PAYMENT_WINDOW_HOURS).toBe(24)
        expect(env.ORDER_EXPIRY_INTERVAL_MINUTES).toBe(10)
        expect(env.EXCHANGE_RATE_MAX_AGE_HOURS).toBe(72)
        expect(env.EXCHANGE_RATE_SYNC_INTERVAL_MINUTES).toBe(120)
        expect(env.SCHEDULED_JOBS_ENABLED).toBeUndefined()
    })

    it('accepts fractions (short windows for testing) and booleans', () => {
        const env = validateEnv({
            ...BASE,
            ORDER_PAYMENT_WINDOW_HOURS: '0.01',
            SCHEDULED_JOBS_ENABLED: 'false',
        })
        expect(env.ORDER_PAYMENT_WINDOW_HOURS).toBe(0.01)
        expect(env.SCHEDULED_JOBS_ENABLED).toBe(false)
        expect(envSchema.safeParse({ ...BASE, ORDER_PAYMENT_WINDOW_HOURS: '0' }).success).toBe(
            false,
        )
        expect(envSchema.safeParse({ ...BASE, SCHEDULED_JOBS_ENABLED: 'maybe' }).success).toBe(
            false,
        )
    })
})

describe('envSchema (public site URL)', () => {
    it('defaults to the Vite dev server and drops trailing slashes', () => {
        expect(validateEnv(BASE).PUBLIC_SITE_URL).toBe('http://localhost:5173')
        expect(
            validateEnv({ ...BASE, PUBLIC_SITE_URL: 'https://manadarusso.com/' }).PUBLIC_SITE_URL,
        ).toBe('https://manadarusso.com')
        expect(envSchema.safeParse({ ...BASE, PUBLIC_SITE_URL: 'not a url' }).success).toBe(false)
    })
})
