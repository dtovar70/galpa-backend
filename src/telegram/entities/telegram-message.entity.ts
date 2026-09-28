import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryColumn,
    type Relation,
} from 'typeorm'
import { OrderPayment } from '../../orders/entities/order-payment.entity.js'
import { Order } from '../../orders/entities/order.entity.js'
import { TelegramChat } from './telegram-chat.entity.js'

/**
 * - `payment`: the payment details as a text message (with the action buttons).
 * - `payment_caption`: the proof photo with the details as its caption (with the buttons).
 * - `payment_photo`: the proof photo alone (the details follow in a `payment` message).
 * - `new_order`: the short "Nuevo pedido" notice.
 * - `prompt`: a follow-up question (reject reasons, stock confirmation, reason reply); deleted
 *   once the payment is handled.
 */
export const TELEGRAM_MESSAGE_KINDS = [
    'payment',
    'payment_caption',
    'payment_photo',
    'new_order',
    'prompt',
] as const
export type TelegramMessageKind = (typeof TELEGRAM_MESSAGE_KINDS)[number]

/** What the bot sent, so it can edit the messages later (e.g. remove stale buttons). */
@Entity({ name: 'telegram_messages' })
@Index('telegram_messages_order_id_idx', ['orderId'])
@Index('telegram_messages_payment_id_idx', ['paymentId'])
@Index('telegram_messages_chat_message_key', ['chatId', 'messageId'], { unique: true })
@Check(
    'telegram_messages_kind_check',
    `"kind" IN (${TELEGRAM_MESSAGE_KINDS.map((kind) => `'${kind}'`).join(', ')})`,
)
export class TelegramMessage {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'telegram_messages_pkey' })
    id: string

    @Column({ name: 'chat_id', type: 'bigint' })
    chatId: string

    /** Unlinking a chat forgets its messages. */
    @ManyToOne(() => TelegramChat, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: false })
    @JoinColumn({
        name: 'chat_id',
        referencedColumnName: 'chatId',
        foreignKeyConstraintName: 'telegram_messages_chat_id_fkey',
    })
    chat: Relation<TelegramChat>

    @Column({ name: 'message_id', type: 'integer' })
    messageId: number

    @Column({ name: 'order_id', type: 'text' })
    orderId: string

    @ManyToOne(() => Order, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'order_id', foreignKeyConstraintName: 'telegram_messages_order_id_fkey' })
    order: Relation<Order>

    @Column({ name: 'payment_id', type: 'text', nullable: true })
    paymentId: string | null

    @ManyToOne(() => OrderPayment, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: true })
    @JoinColumn({
        name: 'payment_id',
        foreignKeyConstraintName: 'telegram_messages_payment_id_fkey',
    })
    payment: Relation<OrderPayment> | null

    @Column({ type: 'text' })
    kind: TelegramMessageKind

    /**
     * Line appended once the payment was handled ("✅ Pago confirmado por Ana · 3:15 p. m."), so a
     * later refresh renders the same text. Null while pending.
     */
    @Column({ type: 'text', nullable: true })
    resolution: string | null

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date
}
