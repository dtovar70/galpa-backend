import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AuthModule } from './auth/auth.module.js'
import { CategoriesModule } from './categories/categories.module.js'
import { ContentModule } from './content/content.module.js'
import { validateEnv } from './config/env.schema.js'
import { DatabaseModule } from './database/database.module.js'
import { HealthController } from './health/health.controller.js'
import { ProductsModule } from './products/products.module.js'
import { StorageModule } from './storage/storage.module.js'

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
        ThrottlerModule.forRoot({
            throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
            errorMessage: 'Demasiadas solicitudes. Espera un minuto e intenta de nuevo.',
        }),
        DatabaseModule,
        StorageModule,
        AuthModule,
        ProductsModule,
        CategoriesModule,
        ContentModule,
    ],
    controllers: [HealthController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
