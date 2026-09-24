import type { Request } from 'express'
import type { Role } from '../../auth/role.enum.js'

/** User shape exposed by the API (never includes the password hash). */
export interface AuthUser {
    id: string
    email: string
    name: string
    role: Role
    createdAt: Date
    updatedAt: Date
}

export interface JwtPayload {
    sub: string
    role: Role
}

/** Standard claims added by the signer (seconds since the epoch). */
export interface JwtClaims extends JwtPayload {
    iat?: number
    exp?: number
}

/** Lifetime of the session token that authenticated the current request. */
export interface SessionToken {
    issuedAt: Date
    expiresAt: Date
}

/** Session timing the admin front needs to run its inactivity prompt. */
export interface SessionInfo {
    /** Absolute expiry of the session cookie/token (ISO 8601). */
    expiresAt: string
    /** Seconds left until `expiresAt`, so the client does not depend on its own clock. */
    expiresInSeconds: number
    /** Full lifetime of a freshly issued token. */
    ttlSeconds: number
    /** Inactivity limit before the "extend session?" prompt. */
    idleMinutes: number
    /** Countdown of that prompt before the session is closed. */
    promptSeconds: number
}

/** Body of `POST /auth/login`, `POST /auth/refresh` and `GET /auth/me`. */
export type AuthSession = AuthUser & { session: SessionInfo }

export type AuthenticatedRequest = Request & { user?: AuthUser; sessionToken?: SessionToken }
