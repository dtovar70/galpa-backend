import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Logger } from '@nestjs/common'
import { IMAGE_EXTENSIONS } from './image-type.js'
import type { StorageService, StoredFile, UploadableImage } from './storage.service.js'

/** Root folder for local uploads, served statically at `/uploads` (see main.ts). */
export const LOCAL_UPLOADS_DIR = join(process.cwd(), 'uploads')

const PRODUCTS_SUBDIR = 'products'
const SAFE_PUBLIC_ID = /^products\/[a-f0-9-]{36}\.(jpg|png|webp)$/

/** Development fallback used when Cloudinary is not configured. */
export class LocalStorageService implements StorageService {
    readonly driver = 'local' as const
    private readonly logger = new Logger(LocalStorageService.name)

    constructor(private readonly publicApiUrl: string) {}

    async upload(image: UploadableImage): Promise<StoredFile> {
        const directory = join(LOCAL_UPLOADS_DIR, PRODUCTS_SUBDIR)
        await mkdir(directory, { recursive: true })

        const fileName = `${randomUUID()}.${IMAGE_EXTENSIONS[image.type]}`
        await writeFile(join(directory, fileName), image.buffer)

        const publicId = `${PRODUCTS_SUBDIR}/${fileName}`
        return { url: `${this.publicApiUrl}/uploads/${publicId}`, publicId }
    }

    async delete(publicId: string): Promise<void> {
        // Guard against path traversal: only delete files this service created.
        if (!SAFE_PUBLIC_ID.test(publicId)) {
            this.logger.warn(`Refusing to delete unexpected local file key "${publicId}"`)
            return
        }
        try {
            await unlink(join(LOCAL_UPLOADS_DIR, publicId))
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
    }
}
