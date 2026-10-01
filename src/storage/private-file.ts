import { Readable } from 'node:stream'
import type { PrivateFileAccess } from './storage.service.js'

const FETCH_TIMEOUT_MS = 15_000

export interface OpenedPrivateFile {
    stream: Readable
    contentType: string
    /** Null when the remote server did not say. */
    size: number | null
}

/**
 * The bytes of a private file as a stream, whatever the storage: the local stream as is, or the
 * short-lived signed URL fetched server-side (so the API can name the download or forward it).
 * Null when the remote copy cannot be fetched.
 */
export async function openPrivateFile(
    access: PrivateFileAccess,
): Promise<OpenedPrivateFile | null> {
    if (access.kind === 'stream') {
        return { stream: access.stream, contentType: access.contentType, size: access.size }
    }
    const response = await fetch(access.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!response.ok || !response.body) return null
    const length = Number(response.headers.get('content-length') ?? '')
    return {
        stream: Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
        size: Number.isFinite(length) && length > 0 ? length : null,
    }
}

/** Reads a whole private file into memory; null past `maxBytes` or when it cannot be read. */
export async function readPrivateBuffer(
    access: PrivateFileAccess,
    maxBytes: number,
): Promise<{ buffer: Buffer; contentType: string } | null> {
    const opened = await openPrivateFile(access)
    if (!opened || (opened.size !== null && opened.size > maxBytes)) {
        opened?.stream.destroy()
        return null
    }
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of opened.stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
        size += buffer.length
        if (size > maxBytes) {
            opened.stream.destroy()
            return null
        }
        chunks.push(buffer)
    }
    return { buffer: Buffer.concat(chunks), contentType: opened.contentType }
}
