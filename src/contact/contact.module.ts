import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CatalogsModule } from '../catalogs/catalogs.module.js'
import { ContentModule } from '../content/content.module.js'
import { MailModule } from '../mail/mail.module.js'
import { Product } from '../products/entities/product.entity.js'
import { TelegramModule } from '../telegram/telegram.module.js'
import { ContactController } from './contact.controller.js'
import { ContactService } from './contact.service.js'

/** The storefront's contact form, delivered to the owner's Telegram chats and the store inbox. */
@Module({
    imports: [
        TypeOrmModule.forFeature([Product]),
        TelegramModule,
        CatalogsModule,
        ContentModule,
        MailModule,
    ],
    controllers: [ContactController],
    providers: [ContactService],
})
export class ContactModule {}
