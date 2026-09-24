import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary'
import type { StorageService, StoredFile, UploadableImage } from './storage.service.js'

export interface CloudinaryCredentials {
    cloudName: string
    apiKey: string
    apiSecret: string
}

const FOLDER = 'manada-russo/products'

export class CloudinaryStorageService implements StorageService {
    readonly driver = 'cloudinary' as const

    constructor(credentials: CloudinaryCredentials) {
        cloudinary.config({
            cloud_name: credentials.cloudName,
            api_key: credentials.apiKey,
            api_secret: credentials.apiSecret,
            secure: true,
        })
    }

    upload(image: UploadableImage): Promise<StoredFile> {
        return new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                { folder: FOLDER, resource_type: 'image' },
                (error, result?: UploadApiResponse) => {
                    if (error || !result) {
                        reject(new Error(error?.message ?? 'Cloudinary upload failed'))
                        return
                    }
                    resolve({ url: result.secure_url, publicId: result.public_id })
                },
            )
            stream.end(image.buffer)
        })
    }

    async delete(publicId: string): Promise<void> {
        await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true })
    }
}
