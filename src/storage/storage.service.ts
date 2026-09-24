import type { ImageType } from './image-type.js'

export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE')

export interface UploadableImage {
    buffer: Buffer
    type: ImageType
}

export interface StoredFile {
    /** Public URL to render the file. */
    url: string
    /** Storage key used later to delete the file. */
    publicId: string
}

/** Image storage backend. Implementations: Cloudinary (production) or local disk (dev). */
export interface StorageService {
    readonly driver: 'cloudinary' | 'local'
    upload(image: UploadableImage): Promise<StoredFile>
    delete(publicId: string): Promise<void>
}
