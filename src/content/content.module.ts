import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CatalogsModule } from '../catalogs/catalogs.module.js'
import { AdminContentController, ContentController } from './content.controller.js'
import { ContentService } from './content.service.js'
import { SiteContentEntry } from './entities/site-content.entity.js'

@Module({
    imports: [TypeOrmModule.forFeature([SiteContentEntry]), CatalogsModule],
    controllers: [ContentController, AdminContentController],
    providers: [ContentService],
    exports: [ContentService],
})
export class ContentModule {}
