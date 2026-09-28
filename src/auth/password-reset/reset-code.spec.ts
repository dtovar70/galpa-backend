import { generateResetCode, hashResetCode, resetCodeHashesMatch } from './reset-code.js'

const SECRET = 'x'.repeat(32)

describe('password reset codes', () => {
    it('are 6 digits', () => {
        for (let index = 0; index < 50; index++) expect(generateResetCode()).toMatch(/^\d{6}$/)
    })

    it('hash with the secret and the user, never alike for two users', () => {
        const hash = hashResetCode('482913', 'user-1', SECRET)
        expect(hash).toMatch(/^[a-f0-9]{64}$/)
        expect(hashResetCode('482913', 'user-1', SECRET)).toBe(hash)
        expect(hashResetCode('482913', 'user-2', SECRET)).not.toBe(hash)
        expect(hashResetCode('482913', 'user-1', 'y'.repeat(32))).not.toBe(hash)
    })

    it('compare hashes safely', () => {
        const hash = hashResetCode('482913', 'user-1', SECRET)
        expect(resetCodeHashesMatch(hash, hash)).toBe(true)
        expect(resetCodeHashesMatch(hashResetCode('482914', 'user-1', SECRET), hash)).toBe(false)
        expect(resetCodeHashesMatch(hash, null)).toBe(false)
        expect(resetCodeHashesMatch('nope', hash)).toBe(false)
    })
})
