import type { NestExpressApplication } from '@nestjs/platform-express'
import type { Env, TrustProxy } from './env.schema.js'

/**
 * Express `trust proxy` for this deployment: TRUST_PROXY when set, else 1 in production (Caddy
 * is the single reverse proxy in front of the API) and off elsewhere (direct connections).
 */
export function resolveTrustProxy(env: Pick<Env, 'NODE_ENV' | 'TRUST_PROXY'>): TrustProxy {
    if (env.TRUST_PROXY !== undefined) return env.TRUST_PROXY
    return env.NODE_ENV === 'production' ? 1 : false
}

/**
 * Behind a reverse proxy every connection comes from the proxy, so without this `req.ip` is the
 * proxy's address: the IP throttler would put every customer in one bucket (and lock them all
 * out together), and logs would lose the client. With it, Express reads the client from
 * X-Forwarded-For, trusting only the configured hops, so a client cannot spoof its address.
 */
export function applyTrustProxy(app: NestExpressApplication, value: TrustProxy): void {
    app.set('trust proxy', value)
}
