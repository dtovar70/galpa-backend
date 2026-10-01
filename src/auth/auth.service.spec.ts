import type { ConfigService } from '@nestjs/config'
import { HttpException, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import argon2 from 'argon2'
import type { Repository } from 'typeorm'
import type { AuthUser } from '../common/types/auth-user.js'
import type { Env } from '../config/env.schema.js'
import { AuthService, LOGIN_FAILURE_LIMIT } from './auth.service.js'
import type { User } from './entities/user.entity.js'
import { Role } from './role.enum.js'

const CHEAP_ARGON2 = { timeCost: 2, memoryCost: 1024, parallelism: 1 }

const USER: AuthUser = {
    id: 'user-1',
    email: 'admin@example.com',
    name: 'Admin',
    role: Role.ADMIN,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
}

function createService(idleMinutes = 30, promptSeconds = 30, users = {} as Repository<User>) {
    const values: Partial<Env> = {
        SESSION_IDLE_MINUTES: idleMinutes,
        SESSION_PROMPT_SECONDS: promptSeconds,
    }
    const config = {
        get: (key: keyof Env) => values[key],
    } as unknown as ConfigService<Env, true>
    const jwt = new JwtService({ secret: 'x'.repeat(32) })
    return { service: new AuthService(users, jwt, config), jwt }
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

describe('AuthService login and password changes', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    /** A users repository whose login lookup finds `row` (or nobody). */
    function usersFinding(row: Partial<User> | null) {
        const builder = {
            addSelect: () => builder,
            where: () => builder,
            getOne: () => Promise.resolve(row),
        }
        return { createQueryBuilder: () => builder } as unknown as Repository<User>
    }

    it('rejects a deactivated account with the wrong-password error, after the same work', async () => {
        const passwordHash = await argon2.hash('Clave-correcta-1')
        const verify = vi.spyOn(argon2, 'verify')
        const inactive = { ...USER, passwordHash, isActive: false }
        const { service } = createService(30, 30, usersFinding(inactive))
        const { service: unknown } = createService(30, 30, usersFinding(null))

        const denied = service.validateCredentials(USER.email, 'Clave-correcta-1')
        await expect(denied).rejects.toThrow(UnauthorizedException)
        await expect(denied).rejects.toThrow('Correo o contraseña incorrectos.')
        await expect(unknown.validateCredentials('x@y.com', 'Clave-correcta-1')).rejects.toThrow(
            'Correo o contraseña incorrectos.',
        )
        // argon2 ran for both (the real hash, and the dummy one for the unknown email).
        expect(verify).toHaveBeenCalledTimes(2)
    })

    it('answers 429 after 10 failed logins for an email, without checking the password', async () => {
        // Cheap argon2 parameters: these tests verify many times.
        const passwordHash = await argon2.hash('Clave-correcta-1', CHEAP_ARGON2)
        const { service } = createService(
            30,
            30,
            usersFinding({ ...USER, passwordHash, isActive: true }),
        )
        for (let i = 0; i < LOGIN_FAILURE_LIMIT; i++) {
            await expect(service.validateCredentials(USER.email, 'mala')).rejects.toThrow(
                UnauthorizedException,
            )
        }
        const verify = vi.spyOn(argon2, 'verify')
        // Even the right password, and whatever the case/spaces of the email.
        const blocked = service.validateCredentials(
            ` ${USER.email.toUpperCase()} `,
            'Clave-correcta-1',
        )
        await expect(blocked).rejects.toBeInstanceOf(HttpException)
        await expect(blocked).rejects.toMatchObject({
            status: 429,
            message: 'Demasiadas solicitudes. Espera un minuto e intenta de nuevo.',
        })
        expect(verify).not.toHaveBeenCalled()
        // Another email is not affected.
        await expect(service.validateCredentials('otra@example.com', 'mala')).rejects.toThrow(
            UnauthorizedException,
        )
    })

    it('forgets the failures of an email after a successful login', async () => {
        // Cheap argon2 parameters: these tests verify many times.
        const passwordHash = await argon2.hash('Clave-correcta-1', CHEAP_ARGON2)
        const { service } = createService(
            30,
            30,
            usersFinding({ ...USER, passwordHash, isActive: true }),
        )
        for (let i = 0; i < LOGIN_FAILURE_LIMIT - 1; i++) {
            await expect(service.validateCredentials(USER.email, 'mala')).rejects.toThrow()
        }
        await expect(
            service.validateCredentials(USER.email, 'Clave-correcta-1'),
        ).resolves.toMatchObject({
            id: USER.id,
        })
        await expect(service.validateCredentials(USER.email, 'mala')).rejects.toThrow(
            UnauthorizedException,
        )
    })

    it('signs the token after a password change dated at the change', async () => {
        const { service, jwt } = createService()
        const ahead = new Date((Math.floor(Date.now() / 1000) + 1) * 1000)
        const { token, issuedAt } = await service.createSession(USER, ahead)
        const claims = jwt.decode<{ iat: number; exp: number }>(token)
        expect(claims.iat * 1000).toBe(ahead.getTime())
        expect(issuedAt).toEqual(ahead)
        expect(claims.exp - claims.iat).toBe(service.settings.ttlSeconds)
        // And it verifies (a token dated up to a second ahead is accepted).
        await expect(jwt.verifyAsync(token)).resolves.toMatchObject({ sub: USER.id })
    })
})
