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
        expect(env.EXCHANGE_RATE_MAX_AGE_HOURS).toBe(24)
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

describe('envSchema (Telegram)', () => {
    it('leaves every Telegram variable optional', () => {
        const env = validateEnv(BASE)
        expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined()
        expect(env.TELEGRAM_ENABLED).toBeUndefined()
        expect(env.TELEGRAM_MODE).toBeUndefined()
        expect(env.TELEGRAM_WEBHOOK_SECRET).toBeUndefined()
    })

    it('parses the mode, the switch and the webhook secret', () => {
        const env = validateEnv({
            ...BASE,
            TELEGRAM_BOT_TOKEN: ' 123:abc ',
            TELEGRAM_ENABLED: 'false',
            TELEGRAM_MODE: 'webhook',
            TELEGRAM_WEBHOOK_SECRET: 'abc_DEF-123',
            TELEGRAM_API_ROOT: 'http://127.0.0.1:8081/',
        })
        expect(env).toMatchObject({
            TELEGRAM_BOT_TOKEN: '123:abc',
            TELEGRAM_ENABLED: false,
            TELEGRAM_MODE: 'webhook',
            TELEGRAM_WEBHOOK_SECRET: 'abc_DEF-123',
            TELEGRAM_API_ROOT: 'http://127.0.0.1:8081',
        })
    })

    it('rejects an unknown mode and a secret Telegram would refuse', () => {
        expect(envSchema.safeParse({ ...BASE, TELEGRAM_MODE: 'push' }).success).toBe(false)
        expect(
            envSchema.safeParse({ ...BASE, TELEGRAM_WEBHOOK_SECRET: 'has spaces!' }).success,
        ).toBe(false)
    })
})

describe('envSchema (mail)', () => {
    it('defaults to the log driver with nothing else required', () => {
        const env = validateEnv(BASE)
        expect(env.MAIL_DRIVER).toBe('log')
        expect(env.MAIL_FROM).toBeUndefined()
        expect(env.SMTP_PORT).toBeUndefined()
    })

    it('accepts Mailpit settings (smtp without login)', () => {
        const env = validateEnv({
            ...BASE,
            MAIL_DRIVER: 'smtp',
            MAIL_FROM: 'Manada Russo Creativa <pedidos@manadarusso.test>',
            SMTP_HOST: 'localhost',
            SMTP_PORT: '1025',
            SMTP_USER: '',
            SMTP_PASS: '',
        })
        expect(env).toMatchObject({ MAIL_DRIVER: 'smtp', SMTP_HOST: 'localhost', SMTP_PORT: 1025 })
        expect(env.SMTP_USER).toBeUndefined()
    })

    it('requires the right variables per driver', () => {
        expect(() => validateEnv({ ...BASE, MAIL_DRIVER: 'smtp' })).toThrow(
            /MAIL_FROM[\s\S]*SMTP_HOST[\s\S]*SMTP_PORT/,
        )
        expect(() =>
            validateEnv({
                ...BASE,
                MAIL_DRIVER: 'smtp',
                MAIL_FROM: 'pedidos@example.com',
                SMTP_HOST: 'smtp.example.com',
                SMTP_PORT: '587',
                SMTP_USER: 'only-user',
            }),
        ).toThrow(/SMTP_PASS/)
        expect(() =>
            validateEnv({ ...BASE, MAIL_DRIVER: 'resend', MAIL_FROM: 'pedidos@example.com' }),
        ).toThrow(/RESEND_API_KEY/)
        expect(
            validateEnv({
                ...BASE,
                MAIL_DRIVER: 'resend',
                MAIL_FROM: 'pedidos@example.com',
                MAIL_REPLY_TO: 'Tienda <hola@example.com>',
                RESEND_API_KEY: 're_123',
            }).MAIL_DRIVER,
        ).toBe('resend')
    })

    it('rejects an unknown driver, a malformed sender and a bad port', () => {
        expect(envSchema.safeParse({ ...BASE, MAIL_DRIVER: 'sendgrid' }).success).toBe(false)
        expect(envSchema.safeParse({ ...BASE, MAIL_FROM: 'not an address' }).success).toBe(false)
        expect(envSchema.safeParse({ ...BASE, SMTP_PORT: '70000' }).success).toBe(false)
        expect(envSchema.safeParse({ ...BASE, SMTP_PORT: 'abc' }).success).toBe(false)
    })
})
