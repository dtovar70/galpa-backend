import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '../auth/entities/user.entity.js'
import { TelegramChat } from '../telegram/entities/telegram-chat.entity.js'
import { AdminUsersController } from './admin-users.controller.js'
import { AdminUsersService } from './admin-users.service.js'

/** Admin user management: accounts, roles, password resets and deactivation. */
@Module({
    imports: [TypeOrmModule.forFeature([User, TelegramChat])],
    controllers: [AdminUsersController],
    providers: [AdminUsersService],
})
export class UsersModule {}
