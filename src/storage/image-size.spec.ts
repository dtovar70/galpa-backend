import { isWithinPixelLimits, MAX_IMAGE_DIMENSIONS_TEXT, readImageSize } from './image-size.js'

function png(width: number, height: number): Buffer {
    const buffer = Buffer.alloc(33)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer)
    buffer.writeUInt32BE(13, 8)
    buffer.write('IHDR', 12, 'ascii')
    buffer.writeUInt32BE(width, 16)
    buffer.writeUInt32BE(height, 20)
    return buffer
}

function webp(chunk: string, body: number[]): Buffer {
    const header = Buffer.alloc(20)
    header.write('RIFF', 0, 'ascii')
    header.write('WEBP', 8, 'ascii')
    header.write(chunk, 12, 'ascii')
    return Buffer.concat([header, Buffer.from(body), Buffer.alloc(16)])
}

describe('readImageSize', () => {
    it('reads PNG sizes from the IHDR chunk', () => {
        expect(readImageSize(png(1200, 800), 'png')).toEqual({ width: 1200, height: 800 })
        expect(readImageSize(png(1200, 800).subarray(0, 20), 'png')).toBeNull()
        expect(readImageSize(png(0, 800), 'png')).toBeNull()
    })

    it('finds the JPEG frame after other segments', () => {
        const jpeg = Buffer.from([
            0xff, 0xd8, 0xff, 0xe1, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc4, 0x00, 0x03, 0x00, 0xff,
            0xc2, 0x00, 0x0b, 0x08, 0x02, 0x58, 0x03, 0x20, 0x01, 0x01, 0x11, 0x00,
        ])
        // Progressive frame (C2): 800 × 600; the DHT (C4) before it has no size.
        expect(readImageSize(jpeg, 'jpeg')).toEqual({ width: 800, height: 600 })
        expect(readImageSize(Buffer.from([0xff, 0xd8, 0xff, 0xd9]), 'jpeg')).toBeNull()
    })

    it('reads lossy, lossless and extended WEBP headers', () => {
        // VP8: frame tag at bytes 20-22, key frame start code at 23-25, then 14-bit width and height.
        expect(
            readImageSize(
                webp('VP8 ', [0, 0, 0, 0x9d, 0x01, 0x2a, 0x80, 0x02, 0xe0, 0x01]),
                'webp',
            ),
        ).toEqual({ width: 640, height: 480 })
        // VP8L: signature 0x2f at byte 20, then (width - 1) and (height - 1) in 14 bits each.
        const bits = 99 | (49 << 14)
        expect(
            readImageSize(
                webp('VP8L', [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, 0]),
                'webp',
            ),
        ).toEqual({ width: 100, height: 50 })
        // VP8X: canvas (width - 1) and (height - 1) in 24 bits each at bytes 24 and 27.
        expect(
            readImageSize(webp('VP8X', [0, 0, 0, 0, 0xff, 0x0f, 0x00, 0x7f, 0x02, 0x00]), 'webp'),
        ).toEqual({ width: 4096, height: 640 })
    })
})

describe('isWithinPixelLimits', () => {
    it('accepts up to 12000 px per side and 80 megapixels', () => {
        expect(isWithinPixelLimits({ width: 12_000, height: 6_000 })).toBe(true)
        expect(isWithinPixelLimits({ width: 8_000, height: 10_000 })).toBe(true)
        expect(isWithinPixelLimits({ width: 12_001, height: 100 })).toBe(false)
        expect(isWithinPixelLimits({ width: 100, height: 12_001 })).toBe(false)
        expect(isWithinPixelLimits({ width: 10_000, height: 8_001 })).toBe(false)
        expect(MAX_IMAGE_DIMENSIONS_TEXT).toBe('12.000 × 12.000 px (80 megapíxeles)')
    })
})
