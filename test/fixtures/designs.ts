import type { Test } from 'supertest'
import { artworkSize } from '../../src/designs/design-templates.js'
import type { Row } from './fake-orders-db.js'

/** The first bytes of a PNG: signature and IHDR with the given size (enough for the API). */
export function png(width: number, height: number): Buffer {
    const header = Buffer.alloc(33)
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0)
    header.writeUInt32BE(13, 8)
    header.write('IHDR', 12, 'ascii')
    header.writeUInt32BE(width, 16)
    header.writeUInt32BE(height, 20)
    header[24] = 8
    header[25] = 6
    return header
}

/** A JPEG with an APP0 segment and a baseline SOF0 frame of the given size. */
export function jpeg(width: number, height: number): Buffer {
    const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00])
    const sof = Buffer.from([0xff, 0xc0, 0x00, 0x0b, 0x08, 0, 0, 0, 0, 0x01, 0x01, 0x11, 0x00])
    sof.writeUInt16BE(height, 5)
    sof.writeUInt16BE(width, 7)
    return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])])
}

export const PLACEMENT = { x: 0, y: 0, scale: 1, rotation: 0 }

/** The mugs' hardcoded print area (20 × 8.5 cm). */
export const MUG_PRINT = { widthCm: 20, heightCm: 8.5 }

/** A PNG the size the editor renders the arte final for this print area. */
export function artworkPng(print: { widthCm: number; heightCm: number } = MUG_PRINT): Buffer {
    const { width, height } = artworkSize(print)
    return png(width, height)
}

export function imageLayer(assetIndex = 0, z = assetIndex, placement: Row = PLACEMENT): Row {
    return { type: 'image', z, assetIndex, placement }
}

export function textLayer(z: number, extra: Row = {}): Row {
    return {
        type: 'text',
        z,
        placement: { x: 0, y: 0.2, scale: 1, rotation: 0 },
        content: 'Sofía 7',
        font: 'pacifico',
        color: '#e75f9b',
        outline: 'white',
        align: 'center',
        ...extra,
    }
}

export interface DesignUploadParts {
    /** Text fields (productId, variantId, templateColorId, layers…); undefined skips one. */
    fields: Row
    /** `null` sends no originals. */
    originals?: { buffer: Buffer; type?: string; name?: string }[] | null
    /** `null` skips the file. */
    artwork?: Buffer | null
    preview?: Buffer | null
}

/** Fills a `POST /api/designs` request with its multipart fields and files. */
export function attachDesign(req: Test, parts: DesignUploadParts): Test {
    for (const [key, value] of Object.entries(parts.fields)) {
        if (value !== undefined) {
            req.field(key, typeof value === 'string' ? value : JSON.stringify(value))
        }
    }
    const originals =
        parts.originals === undefined ? [{ buffer: jpeg(2362, 1004) }] : (parts.originals ?? [])
    for (const [index, original] of originals.entries()) {
        req.attach('originals', original.buffer, {
            filename: original.name ?? `foto-${index + 1}.jpg`,
            contentType: original.type ?? 'image/jpeg',
        })
    }
    const artwork = parts.artwork === undefined ? artworkPng() : parts.artwork
    if (artwork) {
        req.attach('artwork', artwork, { filename: 'arte-final.png', contentType: 'image/png' })
    }
    const preview = parts.preview === undefined ? png(800, 667) : parts.preview
    if (preview) {
        req.attach('preview', preview, { filename: 'vista-previa.png', contentType: 'image/png' })
    }
    return req
}
