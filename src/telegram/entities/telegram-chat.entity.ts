import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from 'typeorm'
import { User } from '../../auth/entities/user.entity.js'
import { TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'

/**
 * A Telegram chat linked to the shop (with a one-time code from the admin). Only linked, active
 * chats receive order data or may act on payments. `chat_id` is Telegram's id (bigint, read as a
 * string so it never loses precision).
 */
@Entity({ name: 'telegram_chats' })
@Index('telegram_chats_chat_id_key', ['chatId'], { unique: true })
export class TelegramChat {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'telegram_chats_pkey' })
    id: string

    @Column({ name: 'chat_id', type: 'bigint' })
    chatId: string

    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH, nullable: true })
    username: string | null

    @Column({ name: 'first_name', type: 'varchar', length: TEXT_INPUT_MAX_LENGTH, nullable: true })
    firstName: string | null

    /** The admin who generated the code; the bot acts on their behalf (history, reviews). */
    @Column({ name: 'linked_by_user_id', type: 'text', nullable: true })
    linkedByUserId: string | null

    @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
    @JoinColumn({
        name: 'linked_by_user_id',
        foreignKeyConstraintName: 'telegram_chats_linked_by_user_id_fkey',
    })
    linkedBy: Relation<User> | null

    /** False once Telegram answers 403 (the user blocked the bot); set again when they write. */
    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean

    /** Also receives "Nuevo pedido" messages (payments are always sent). */
    @Column({ name: 'notify_new_orders', type: 'boolean', default: false })
    notifyNewOrders: boolean

    @Column({ name: 'linked_at', type: 'timestamptz', precision: 3, default: () => 'now()' })
    linkedAt: Date

    @Column({ name: 'last_seen_at', type: 'timestamptz', precision: 3, nullable: true })
    lastSeenAt: Date | null
}
