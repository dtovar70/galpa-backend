import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BanksService } from './banks.service.js'
import { AdminCatalogsController, CatalogsController } from './catalogs.controller.js'
import { Bank } from './entities/bank.entity.js'
import { OrderStatusDefinition } from './entities/order-status-definition.entity.js'
import { OrderStatusGroup } from './entities/order-status-group.entity.js'
import { OrderStatusCatalogService } from './order-status-catalog.service.js'

/**
 * Business catalogs kept in the database: order status labels and tabs, and the banks. What the
 * code's behavior depends on (status codes, transitions) stays in code.
 */
@Module({
    imports: [TypeOrmModule.forFeature([OrderStatusDefinition, OrderStatusGroup, Bank])],
    controllers: [CatalogsController, AdminCatalogsController],
    providers: [OrderStatusCatalogService, BanksService],
    exports: [OrderStatusCatalogService, BanksService],
})
export class CatalogsModule {}
