import { Global, Logger, Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '../config/env.schema.js'
import { CloudinaryStorageService } from './cloudinary-storage.service.js'
import { LocalStorageService } from './local-storage.service.js'
import { STORAGE_SERVICE, type StorageService } from './storage.service.js'

/**
 * Picks the storage backend at startup: Cloudinary when all CLOUDINARY_* variables are set,
 * otherwise local disk (./uploads, served at /uploads). Production never falls back to local
 * disk (the env schema already requires Cloudinary there; this is the last line of defense).
 */
@Global()
@Module({
    providers: [
        {
            provide: STORAGE_SERVICE,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>): StorageService => {
                const logger = new Logger('StorageModule')
                const cloudName = config.get('CLOUDINARY_CLOUD_NAME', { infer: true })
                const apiKey = config.get('CLOUDINARY_API_KEY', { infer: true })
                const apiSecret = config.get('CLOUDINARY_API_SECRET', { infer: true })

                if (cloudName && apiKey && apiSecret) {
                    logger.log(`Image storage: Cloudinary (cloud "${cloudName}")`)
                    return new CloudinaryStorageService({ cloudName, apiKey, apiSecret })
                }

                if (config.get('NODE_ENV', { infer: true }) === 'production') {
                    throw new Error(
                        'Local-disk image storage is not allowed in production: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
                    )
                }
                if (cloudName || apiKey || apiSecret) {
                    logger.warn('Cloudinary is partially configured; falling back to local disk')
                }
                logger.log('Image storage: local disk (./uploads served at /uploads)')
                return new LocalStorageService(config.get('PUBLIC_API_URL', { infer: true }))
            },
        },
    ],
    exports: [STORAGE_SERVICE],
})
export class StorageModule {}
