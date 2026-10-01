import { Module } from '@nestjs/common'
import { CatalogsModule } from '../catalogs/catalogs.module.js'
import { TelegramModule } from '../telegram/telegram.module.js'
import { ContactController } from './contact.controller.js'
import { ContactService } from './contact.service.js'

/** The storefront's contact form, delivered to the owner's linked Telegram chats. */
@Module({
    imports: [TelegramModule, CatalogsModule],
    controllers: [ContactController],
    providers: [ContactService],
})
export class ContactModule {}
