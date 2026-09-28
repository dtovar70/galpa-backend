import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BanksService } from './banks.service.js'
import { AdminCatalogsController, CatalogsController } from './catalogs.controller.js'
import { Bank } from './entities/bank.entity.js'
import { MobilePrefix } from './entities/mobile-prefix.entity.js'
import { OrderStatusDefinition } from './entities/order-status-definition.entity.js'
import { OrderStatusGroup } from './entities/order-status-group.entity.js'
import { MobilePrefixesService } from './mobile-prefixes.service.js'
import { OrderStatusCatalogService } from './order-status-catalog.service.js'

/**
 * Business catalogs kept in the database: order status labels and tabs, the banks and the
 * mobile operator codes. What the code's behavior depends on (status codes, transitions) stays
 * in code.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([OrderStatusDefinition, OrderStatusGroup, Bank, MobilePrefix]),
    ],
    controllers: [CatalogsController, AdminCatalogsController],
    providers: [OrderStatusCatalogService, BanksService, MobilePrefixesService],
    exports: [OrderStatusCatalogService, BanksService, MobilePrefixesService],
})
export class CatalogsModule {}
