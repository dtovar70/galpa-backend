import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DesignCleanupService } from './design-cleanup.service.js'
import { DesignsController } from './designs.controller.js'
import { DesignsService } from './designs.service.js'
import { DesignAsset } from './entities/design-asset.entity.js'
import { Design } from './entities/design.entity.js'

/**
 * "Diseña con tu imagen": guest uploads and previews. Checkout (OrdersModule) attaches designs
 * to order lines; the admin and Telegram read them through DesignsService.
 */
@Module({
    imports: [TypeOrmModule.forFeature([Design, DesignAsset])],
    controllers: [DesignsController],
    providers: [DesignsService, DesignCleanupService],
    exports: [DesignsService],
})
export class DesignsModule {}
