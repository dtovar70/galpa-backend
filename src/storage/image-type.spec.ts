import { detectImageType } from './image-type.js'

describe('detectImageType', () => {
    it('detects jpeg, png and webp signatures', () => {
        expect(detectImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpeg')
        expect(
            detectImageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])),
        ).toBe('png')
        expect(detectImageType(Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'binary'))).toBe('webp')
    })

    it('rejects anything else, even with an image-like name', () => {
        expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
        expect(detectImageType(Buffer.from('GIF89a'))).toBeNull()
        expect(detectImageType(Buffer.alloc(0))).toBeNull()
    })
})
