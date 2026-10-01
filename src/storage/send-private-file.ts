import { HttpStatus } from '@nestjs/common'
import type { Response } from 'express'
import type { PrivateFileAccess } from './storage.service.js'

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
