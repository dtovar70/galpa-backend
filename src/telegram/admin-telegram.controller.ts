import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
} from '@nestjs/common'
import { Role } from '../auth/role.enum.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import type { AuthUser } from '../common/types/auth-user.js'
import {
    AdminTelegramService,
    type TelegramChatDto,
    type TelegramLinkCodeDto,
    type TelegramOverviewDto,
} from './admin-telegram.service.js'
import { UpdateTelegramChatDto } from './dto/update-telegram-chat.dto.js'

/** The Telegram bot settings page. ADMIN only: linked chats can approve payments. */
@Roles(Role.ADMIN)
@Controller('admin/telegram')
export class AdminTelegramController {
    constructor(private readonly telegram: AdminTelegramService) {}

    @Get()
    @Header('Cache-Control', 'no-store')
    overview(): Promise<TelegramOverviewDto> {
        return this.telegram.overview()
    }

    /** A one-time 6-digit code (10 minutes) to send to the bot as `/start <code>`. */
    @Post('link-codes')
    @Header('Cache-Control', 'no-store')
    createLinkCode(@CurrentUser() user: AuthUser): Promise<TelegramLinkCodeDto> {
        return this.telegram.createLinkCode(user)
    }

    @Patch('chats/:id')
    update(@Param('id') id: string, @Body() dto: UpdateTelegramChatDto): Promise<TelegramChatDto> {
        return this.telegram.setNotifyNewOrders(id, dto.notifyNewOrders)
    }

    @Post('chats/:id/test')
    @HttpCode(HttpStatus.OK)
    sendTest(@Param('id') id: string, @CurrentUser() user: AuthUser): Promise<{ ok: true }> {
        return this.telegram.sendTest(id, user)
    }

    @Delete('chats/:id')
    @HttpCode(HttpStatus.NO_CONTENT)
    unlink(@Param('id') id: string): Promise<void> {
        return this.telegram.unlink(id)
    }
}
