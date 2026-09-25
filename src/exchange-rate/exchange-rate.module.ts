import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ExchangeRate } from './entities/exchange-rate.entity.js'
import { AdminExchangeRateController, ExchangeRateController } from './exchange-rate.controller.js'
import { ExchangeRateService } from './exchange-rate.service.js'
import { BcvProvider } from './providers/bcv.provider.js'
import { DolarApiProvider } from './providers/dolarapi.provider.js'
import { EXCHANGE_RATE_PROVIDERS, type ExchangeRateProvider } from './providers/rate-provider.js'

@Module({
    imports: [TypeOrmModule.forFeature([ExchangeRate])],
    controllers: [ExchangeRateController, AdminExchangeRateController],
    providers: [
        ExchangeRateService,
        {
            // Tried in this order: the official website first, the JSON mirror as fallback.
            provide: EXCHANGE_RATE_PROVIDERS,
            useFactory: (): ExchangeRateProvider[] => [new BcvProvider(), new DolarApiProvider()],
        },
    ],
    exports: [ExchangeRateService],
})
export class ExchangeRateModule {}
