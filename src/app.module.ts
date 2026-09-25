import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { ScheduleModule } from '@nestjs/schedule'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AuthModule } from './auth/auth.module.js'
import { CatalogsModule } from './catalogs/catalogs.module.js'
import { CategoriesModule } from './categories/categories.module.js'
import { ContentModule } from './content/content.module.js'
import { validateEnv } from './config/env.schema.js'
import { DatabaseModule } from './database/database.module.js'
import { ExchangeRateModule } from './exchange-rate/exchange-rate.module.js'
import { HealthController } from './health/health.controller.js'
import { OrdersModule } from './orders/orders.module.js'
import { ProductsModule } from './products/products.module.js'
import { StorageModule } from './storage/storage.module.js'

@Module({
    imports: [
        ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
        ThrottlerModule.forRoot({
            throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
            errorMessage: 'Demasiadas solicitudes. Espera un minuto e intenta de nuevo.',
        }),
        // Domain events (order.created, order.payment_submitted, order.status_changed).
        EventEmitterModule.forRoot(),
        ScheduleModule.forRoot(),
        DatabaseModule,
        StorageModule,
        AuthModule,
        ProductsModule,
        CategoriesModule,
        CatalogsModule,
        ContentModule,
        ExchangeRateModule,
        OrdersModule,
    ],
    controllers: [HealthController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
