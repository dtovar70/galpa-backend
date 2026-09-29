import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ContentModule } from '../../content/content.module.js'
import { MailModule } from '../../mail/mail.module.js'
import { TelegramPasswordResetChannel } from '../../telegram/telegram-password-reset.channel.js'
import { TelegramModule } from '../../telegram/telegram.module.js'
import { PasswordResetCode } from '../entities/password-reset-code.entity.js'
import { User } from '../entities/user.entity.js'
import { EmailPasswordResetChannel } from './email-password-reset.channel.js'
import { PASSWORD_RESET_CHANNEL_LIST } from './password-reset.channel.js'
import { PasswordResetController } from './password-reset.controller.js'
import { PasswordResetService } from './password-reset.service.js'

/**
 * Password recovery for panel users. The delivery channels are listed here, in order of
 * preference: Telegram first (a linked chat), then email as the fallback.
 */
@Module({
    imports: [
        TypeOrmModule.forFeature([User, PasswordResetCode]),
        TelegramModule,
        MailModule,
        ContentModule,
    ],
    controllers: [PasswordResetController],
    providers: [
        PasswordResetService,
        EmailPasswordResetChannel,
        {
            provide: PASSWORD_RESET_CHANNEL_LIST,
            inject: [TelegramPasswordResetChannel, EmailPasswordResetChannel],
            useFactory: (
                telegram: TelegramPasswordResetChannel,
                email: EmailPasswordResetChannel,
            ) => [telegram, email],
        },
    ],
})
export class PasswordResetModule {}
