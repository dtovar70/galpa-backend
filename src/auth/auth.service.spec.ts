import type { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Repository } from 'typeorm'
import type { AuthUser } from '../common/types/auth-user.js'
import type { Env } from '../config/env.schema.js'
import { AuthService } from './auth.service.js'
import type { User } from './entities/user.entity.js'
import { Role } from './role.enum.js'

const USER: AuthUser = {
    id: 'user-1',
    email: 'admin@example.com',
    name: 'Admin',
    role: Role.ADMIN,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
}

function createService(idleMinutes = 30, promptSeconds = 30) {
    const values: Partial<Env> = {
        SESSION_IDLE_MINUTES: idleMinutes,
        SESSION_PROMPT_SECONDS: promptSeconds,
    }
    const config = {
        get: (key: keyof Env) => values[key],
    } as unknown as ConfigService<Env, true>
    const jwt = new JwtService({ secret: 'x'.repeat(32) })
    return { service: new AuthService({} as Repository<User>, jwt, config), jwt }
}

describe('AuthService sessions', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    it('signs tokens that last the idle limit + prompt + margin', async () => {
        const { service, jwt } = createService(30, 30)
        const { token, issuedAt, expiresAt } = await service.createSession(USER)

        const claims = jwt.decode<{ sub: string; iat: number; exp: number }>(token)
        expect(claims.sub).toBe(USER.id)
        expect(claims.exp - claims.iat).toBe(service.settings.ttlSeconds)
        expect(service.settings.ttlSeconds).toBe(30 * 60 + 30 + 60)
        expect(expiresAt.getTime() - issuedAt.getTime()).toBe(service.settings.ttlSeconds * 1000)
    })

    it('describes the session with the settings the front needs', () => {
        vi.useFakeTimers({ now: new Date('2026-09-24T12:00:00Z') })
        const { service } = createService(1, 10)
        const body = service.toAuthSession(USER, {
            issuedAt: new Date('2026-09-24T11:59:30Z'),
            expiresAt: new Date('2026-09-24T12:01:40Z'),
        })

        expect(body).toMatchObject({ id: USER.id, email: USER.email })
        expect(body.session).toEqual({
            expiresAt: '2026-09-24T12:01:40.000Z',
            expiresInSeconds: 100,
            ttlSeconds: 60 + 10 + 60,
            idleMinutes: 1,
            promptSeconds: 10,
        })
    })
})
