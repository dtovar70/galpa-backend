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
