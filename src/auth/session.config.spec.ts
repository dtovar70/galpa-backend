import {
    issuedBeforePasswordChange,
    passwordChangeInstant,
    resolveSessionSettings,
    SESSION_EXPIRY_MARGIN_SECONDS,
    sessionIssuedAt,
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

describe('password change vs. token iat (whole seconds)', () => {
    it('takes effect at the next whole second, after every token signed so far', () => {
        expect(passwordChangeInstant(new Date('2026-09-25T12:00:00.999Z'))).toEqual(
            new Date('2026-09-25T12:00:01.000Z'),
        )
        // Exactly on a second boundary it still moves forward: a token signed in this very
        // second (iat = 12:00:00) must die.
        expect(passwordChangeInstant(new Date('2026-09-25T12:00:00.000Z'))).toEqual(
            new Date('2026-09-25T12:00:01.000Z'),
        )
    })

    it('rejects tokens issued before the change, including earlier in the same second', () => {
        const now = new Date('2026-09-25T12:00:00.400Z')
        const changedAt = passwordChangeInstant(now)
        const signedThisSecond = Math.floor(now.getTime() / 1000)
        expect(issuedBeforePasswordChange(signedThisSecond, changedAt)).toBe(true)
        expect(issuedBeforePasswordChange(signedThisSecond - 60, changedAt)).toBe(true)
        expect(issuedBeforePasswordChange(signedThisSecond + 1, changedAt)).toBe(false)
        expect(issuedBeforePasswordChange(signedThisSecond, null)).toBe(false)
    })

    it('dates new tokens at the change when it is still ahead, so they survive it', () => {
        const nowMs = Date.parse('2026-09-25T12:00:00.400Z')
        const changedAt = passwordChangeInstant(new Date(nowMs))
        const iat = sessionIssuedAt(changedAt, nowMs)
        expect(iat).toBe(changedAt.getTime() / 1000)
        expect(issuedBeforePasswordChange(iat, changedAt)).toBe(false)
        // Later on, tokens simply use the current time.
        expect(sessionIssuedAt(changedAt, nowMs + 5_000)).toBe(Math.floor((nowMs + 5_000) / 1000))
        expect(sessionIssuedAt(null, nowMs)).toBe(Math.floor(nowMs / 1000))
        // A change stored with milliseconds (e.g. edited by hand) rounds up, never down.
        const handEdited = new Date('2026-09-25T12:00:02.300Z')
        const bumped = sessionIssuedAt(handEdited, nowMs)
        expect(issuedBeforePasswordChange(bumped, handEdited)).toBe(false)
    })
})
