import {
    resolveSessionSettings,
    SESSION_EXPIRY_MARGIN_SECONDS,
    tokenLifetime,
} from './session.config.js'

describe('session config', () => {
    it('makes the token outlive the idle limit plus the prompt countdown', () => {
        const settings = resolveSessionSettings({
            SESSION_IDLE_MINUTES: 30,
            SESSION_PROMPT_SECONDS: 30,
        })
        expect(settings).toEqual({
            idleMinutes: 30,
            promptSeconds: 30,
            ttlSeconds: 30 * 60 + 30 + SESSION_EXPIRY_MARGIN_SECONDS,
        })
    })

    it('reads the lifetime of a token within the configured ttl', () => {
        const lifetime = tokenLifetime({ sub: 'u1', role: 'ADMIN', iat: 1000, exp: 2000 }, 1000)
        expect(lifetime).toEqual({
            issuedAt: new Date(1_000_000),
            expiresAt: new Date(2_000_000),
        })
    })

    it('rejects tokens longer than the configured ttl (e.g. old 7-day tokens)', () => {
        const iat = 1_700_000_000
        expect(
            tokenLifetime({ sub: 'u1', role: 'ADMIN', iat, exp: iat + 7 * 86_400 }, 1950),
        ).toBeNull()
    })

    it('rejects tokens without iat/exp', () => {
        expect(tokenLifetime({ sub: 'u1', role: 'ADMIN' }, 1950)).toBeNull()
        expect(tokenLifetime({ sub: 'u1', role: 'ADMIN', iat: 1 }, 1950)).toBeNull()
    })
})
