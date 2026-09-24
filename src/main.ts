import { Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { AppModule } from './app.module.js'
import { createValidationPipe } from './common/pipes/validation.pipe.js'
import type { Env } from './config/env.schema.js'
import { LOCAL_UPLOADS_DIR } from './storage/local-storage.service.js'

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppModule)
    const config = app.get<ConfigService<Env, true>>(ConfigService)

    app.setGlobalPrefix('api')
    // Images are loaded cross-origin by the storefront, so relax CORP for static files.
    app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
    app.use(cookieParser())
    app.enableCors({ origin: config.get('CORS_ORIGIN', { infer: true }), credentials: true })
    app.useGlobalPipes(createValidationPipe())
    // Local-disk image storage (dev fallback). Not affected by the /api prefix.
    app.useStaticAssets(LOCAL_UPLOADS_DIR, { prefix: '/uploads/', index: false })
    app.enableShutdownHooks()

    const port = config.get('PORT', { infer: true })
    await app.listen(port)
    Logger.log(`API listening on http://localhost:${port}/api`, 'Bootstrap')
}

await bootstrap()
