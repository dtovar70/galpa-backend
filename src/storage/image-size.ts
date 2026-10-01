import type { ImageType } from './image-type.js'

export interface ImageSize {
    width: number
    height: number
}

/** Largest accepted side of an uploaded photo (designs' originals, template photos). */
export const MAX_IMAGE_SIDE_PX = 12_000
/** Largest accepted area: 80 megapixels (about 320 MB once decoded to RGBA). */
export const MAX_IMAGE_PIXELS = 80_000_000

/**
 * False for a photo too big to process safely. The byte limit alone does not bound it: a small,
 * well-compressed file can declare a huge canvas that would exhaust memory when decoded.
 */
export function isWithinPixelLimits(size: ImageSize): boolean {
    return (
        size.width <= MAX_IMAGE_SIDE_PX &&
        size.height <= MAX_IMAGE_SIDE_PX &&
        size.width * size.height <= MAX_IMAGE_PIXELS
    )
}

const thousands = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

/** "12.000 × 12.000 px (80 megapíxeles)", for the Spanish messages. */
export const MAX_IMAGE_DIMENSIONS_TEXT = `${thousands(MAX_IMAGE_SIDE_PX)} × ${thousands(MAX_IMAGE_SIDE_PX)} px (${MAX_IMAGE_PIXELS / 1_000_000} megapíxeles)`

function pngSize(buffer: Buffer): ImageSize | null {
    // Signature (8) + IHDR length (4) + "IHDR" (4) + width (4) + height (4).
    if (buffer.length < 24 || buffer.toString('ascii', 12, 16) !== 'IHDR') return null
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

/** SOF markers carry the frame size; DHT (C4), JPG (C8) and DAC (CC) share the range but do not. */
function isStartOfFrame(marker: number): boolean {
    return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
}

function jpegSize(buffer: Buffer): ImageSize | null {
    let offset = 2
    while (offset + 4 <= buffer.length) {
        if (buffer[offset] !== 0xff) return null
        const marker = buffer[offset + 1]!
        // Fill bytes and markers without a length (RSTn, SOI, TEM).
        if (marker === 0xff) {
            offset += 1
            continue
        }
        if ((marker >= 0xd0 && marker <= 0xd8) || marker === 0x01) {
            offset += 2
            continue
        }
        const length = buffer.readUInt16BE(offset + 2)
        if (length < 2) return null
        if (isStartOfFrame(marker)) {
            if (offset + 9 > buffer.length) return null
            return {
                height: buffer.readUInt16BE(offset + 5),
                width: buffer.readUInt16BE(offset + 7),
            }
        }
        offset += 2 + length
    }
    return null
}

function webpSize(buffer: Buffer): ImageSize | null {
    if (buffer.length < 30) return null
    const chunk = buffer.toString('ascii', 12, 16)
    if (chunk === 'VP8 ') {
        // Key frame: start code 9d 01 2a, then 14-bit width and height.
        if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) return null
        return {
            width: buffer.readUInt16LE(26) & 0x3fff,
            height: buffer.readUInt16LE(28) & 0x3fff,
        }
    }
    if (chunk === 'VP8L') {
        if (buffer[20] !== 0x2f) return null
        const bits = buffer.readUInt32LE(21)
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
    }
    if (chunk === 'VP8X') {
        return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 }
    }
    return null
}

/**
 * Pixel size read from the file header (no decoding, no dependency). Null when the header is
 * truncated or not what `type` promises, so a broken file is refused instead of stored.
 */
export function readImageSize(buffer: Buffer, type: ImageType): ImageSize | null {
    const size =
        type === 'png' ? pngSize(buffer) : type === 'jpeg' ? jpegSize(buffer) : webpSize(buffer)
    if (!size || size.width <= 0 || size.height <= 0) return null
    return size
}
