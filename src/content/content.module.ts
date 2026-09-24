import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AdminContentController, ContentController } from './content.controller.js'
import { ContentService } from './content.service.js'
import { SiteContentEntry } from './entities/site-content.entity.js'

@Module({
    imports: [TypeOrmModule.forFeature([SiteContentEntry])],
    controllers: [ContentController, AdminContentController],
    providers: [ContentService],
})
export class ContentModule {}
