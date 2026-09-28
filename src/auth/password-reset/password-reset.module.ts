import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TelegramPasswordResetChannel } from '../../telegram/telegram-password-reset.channel.js'
import { TelegramModule } from '../../telegram/telegram.module.js'
import { PasswordResetCode } from '../entities/password-reset-code.entity.js'
import { User } from '../entities/user.entity.js'
import { PASSWORD_RESET_CHANNEL_LIST } from './password-reset.channel.js'
import { PasswordResetController } from './password-reset.controller.js'
import { PasswordResetService } from './password-reset.service.js'

/**
 * Password recovery for panel users. The delivery channels are listed here, in order of
 * preference; Phase 5 appends the email channel to the factory below.
 */
@Module({
    imports: [TypeOrmModule.forFeature([User, PasswordResetCode]), TelegramModule],
    controllers: [PasswordResetController],
    providers: [
        PasswordResetService,
        {
            provide: PASSWORD_RESET_CHANNEL_LIST,
            inject: [TelegramPasswordResetChannel],
            useFactory: (telegram: TelegramPasswordResetChannel) => [telegram],
        },
    ],
})
export class PasswordResetModule {}
