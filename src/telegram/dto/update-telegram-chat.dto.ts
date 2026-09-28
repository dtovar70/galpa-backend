import { IsBoolean } from 'class-validator'
import { feminine, msg } from '../../common/validation/messages.js'

const NOTIFY_NEW_ORDERS = feminine('La opción de nuevos pedidos')

/** `PATCH /admin/telegram/chats/:id`. */
export class UpdateTelegramChatDto {
    @IsBoolean({ message: msg.boolean(NOTIFY_NEW_ORDERS) })
    notifyNewOrders: boolean
}
