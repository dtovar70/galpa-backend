import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BanksService } from './banks.service.js'
import { AdminCatalogsController, CatalogsController } from './catalogs.controller.js'
import { ContactOptionsService } from './contact-options.service.js'
import { Bank } from './entities/bank.entity.js'
import { ContactTopicOption, SpaceTypeOption } from './entities/contact-option.entity.js'
import { MobilePrefix } from './entities/mobile-prefix.entity.js'
import { OrderStatusDefinition } from './entities/order-status-definition.entity.js'
import { OrderStatusGroup } from './entities/order-status-group.entity.js'
import { PaymentMethodDefinition } from './entities/payment-method-definition.entity.js'
import { MobilePrefixesService } from './mobile-prefixes.service.js'
import { OrderStatusCatalogService } from './order-status-catalog.service.js'
import { PaymentMethodCatalogService } from './payment-method-catalog.service.js'
import { QuoteStatusDefinition } from './entities/quote-status-definition.entity.js'
import { QuoteStatusCatalogService } from './quote-status-catalog.service.js'

/**
 * Business catalogs kept in the database: order status labels and tabs, quote status labels,
 * payment method names, the banks, the mobile operator codes and the contact form options. What
 * the code's behavior depends on (status and payment method codes, transitions) stays in code.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([
            OrderStatusDefinition,
            OrderStatusGroup,
            QuoteStatusDefinition,
            PaymentMethodDefinition,
            Bank,
            MobilePrefix,
            ContactTopicOption,
            SpaceTypeOption,
        ]),
    ],
    controllers: [CatalogsController, AdminCatalogsController],
    providers: [
        OrderStatusCatalogService,
        QuoteStatusCatalogService,
        PaymentMethodCatalogService,
        BanksService,
        MobilePrefixesService,
        ContactOptionsService,
    ],
    exports: [
        OrderStatusCatalogService,
        QuoteStatusCatalogService,
        PaymentMethodCatalogService,
        BanksService,
        MobilePrefixesService,
        ContactOptionsService,
    ],
})
export class CatalogsModule {}
