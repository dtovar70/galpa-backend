import {
    accessTokenMatches,
    accessTokenMatchesAny,
    generateAccessToken,
    hashAccessToken,
} from './order-token.js'

describe('order access token', () => {
    it('is 32 random bytes in base64url and only its SHA-256 is kept', () => {
        const { token, hash } = generateAccessToken()
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(hash).toMatch(/^[a-f0-9]{64}$/)
        expect(hash).toBe(hashAccessToken(token))
        expect(generateAccessToken().token).not.toBe(token)
    })

    it('accepts the right token and rejects anything else', () => {
        const { token, hash } = generateAccessToken()
        expect(accessTokenMatches(token, hash)).toBe(true)
        const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`
        expect(accessTokenMatches(tampered, hash)).toBe(false)
        expect(accessTokenMatches(undefined, hash)).toBe(false)
        expect(accessTokenMatches('', hash)).toBe(false)
        expect(accessTokenMatches(['x'], hash)).toBe(false)
        expect(accessTokenMatches(token, null)).toBe(false)
        expect(accessTokenMatches(token, 'not-a-hash')).toBe(false)
    })

    it('accepts a token that matches any of several links', () => {
        const first = generateAccessToken()
        const second = generateAccessToken()
        const hashes = [first.hash, second.hash]
        expect(accessTokenMatchesAny(first.token, hashes)).toBe(true)
        expect(accessTokenMatchesAny(second.token, hashes)).toBe(true)
        expect(accessTokenMatchesAny(generateAccessToken().token, hashes)).toBe(false)
        expect(accessTokenMatchesAny(first.token, [second.hash])).toBe(false)
        expect(accessTokenMatchesAny(first.token, [])).toBe(false)
        expect(accessTokenMatchesAny(undefined, hashes)).toBe(false)
    })
})
