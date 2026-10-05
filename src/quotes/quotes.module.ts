import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CatalogsModule } from '../catalogs/catalogs.module.js'
import { ContentModule } from '../content/content.module.js'
import { ExchangeRateModule } from '../exchange-rate/exchange-rate.module.js'
import { MailModule } from '../mail/mail.module.js'
import { OrdersModule } from '../orders/orders.module.js'
import { QuoteAccessLink } from './entities/quote-access-link.entity.js'
import { QuoteItem } from './entities/quote-item.entity.js'
import { Quote } from './entities/quote.entity.js'
import { QuoteExpiryService } from './quote-expiry.service.js'
import { AdminQuotesController, QuotesController } from './quotes.controller.js'
import { QuotesService } from './quotes.service.js'

/** Quotes ("Cotizaciones"): prepared by the admin, sent as PDF and converted into orders. */
@Module({
    imports: [
        TypeOrmModule.forFeature([Quote, QuoteItem, QuoteAccessLink]),
        CatalogsModule,
        ContentModule,
        ExchangeRateModule,
        MailModule,
        OrdersModule,
    ],
    controllers: [AdminQuotesController, QuotesController],
    providers: [QuotesService, QuoteExpiryService],
})
export class QuotesModule {}
