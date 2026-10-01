import { HttpStatus, NotFoundException } from '@nestjs/common'
import type { Response } from 'express'
import { openPrivateFile } from '../storage/private-file.js'
import type { PrivateFileAccess } from '../storage/storage.service.js'

function privateHeaders(res: Response): void {
    res.setHeader('Cache-Control', 'private, no-store')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('X-Content-Type-Options', 'nosniff')
}

/**
 * Shows a private image: local disk streams it, Cloudinary redirects to a download URL signed
 * for a few minutes. Never cached, so a later request needs the token (or session) again.
 */
export function sendPrivateFile(res: Response, access: PrivateFileAccess): void {
    privateHeaders(res)
    if (access.kind === 'redirect') {
        res.redirect(HttpStatus.FOUND, access.url)
        return
    }
    res.setHeader('Content-Type', access.contentType)
    res.setHeader('Content-Length', String(access.size))
    res.setHeader('Content-Disposition', 'inline')
    access.stream.on('error', () => res.destroy())
    access.stream.pipe(res)
}

/**
 * Downloads a private file under `filename` (e.g. `MR-000123-linea1.png`). The remote copy is
 * fetched server-side so the name is ours, whatever the storage.
 */
export async function downloadPrivateFile(
    res: Response,
    access: PrivateFileAccess,
    filename: string,
): Promise<void> {
    const file = await openPrivateFile(access)
    if (!file) throw new NotFoundException('No pudimos leer el archivo. Intenta de nuevo.')
    privateHeaders(res)
    res.setHeader('Content-Type', file.contentType)
    if (file.size !== null) res.setHeader('Content-Length', String(file.size))
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`)
    file.stream.on('error', () => res.destroy())
    file.stream.pipe(res)
}
