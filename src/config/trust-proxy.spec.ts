import { resolveTrustProxy } from './trust-proxy.js'

describe('resolveTrustProxy', () => {
    it('trusts one hop (Caddy) by default in production only', () => {
        expect(resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: undefined })).toBe(1)
        expect(resolveTrustProxy({ NODE_ENV: 'development', TRUST_PROXY: undefined })).toBe(false)
        expect(resolveTrustProxy({ NODE_ENV: 'test', TRUST_PROXY: undefined })).toBe(false)
    })

    it('uses TRUST_PROXY when set, even false in production', () => {
        expect(resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: false })).toBe(false)
        expect(resolveTrustProxy({ NODE_ENV: 'development', TRUST_PROXY: 'loopback' })).toBe(
            'loopback',
        )
        expect(resolveTrustProxy({ NODE_ENV: 'production', TRUST_PROXY: 2 })).toBe(2)
    })
})
