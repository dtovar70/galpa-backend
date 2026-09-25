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
import { User } from '../../auth/entities/user.entity.js'
import { ORDER_LIMITS } from '../dto/field-names.js'
import { Order } from './order.entity.js'

/** Internal back-office note on an order. Never shown to the customer. */
@Entity({ name: 'order_notes' })
@Index('order_notes_order_id_idx', ['orderId'])
@Check('order_notes_body_length_check', `char_length("body") <= ${ORDER_LIMITS.note}`)
export class OrderNote {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'order_notes_pkey' })
    id: string

    @Column({ name: 'order_id', type: 'text' })
    orderId: string

    @ManyToOne(() => Order, (order) => order.adminNotes, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    @JoinColumn({ name: 'order_id', foreignKeyConstraintName: 'order_notes_order_id_fkey' })
    order: Relation<Order>

    @Column({ name: 'author_id', type: 'text', nullable: true })
    authorId: string | null

    @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'author_id', foreignKeyConstraintName: 'order_notes_author_id_fkey' })
    author: Relation<User> | null

    @Column({ type: 'text' })
    body: string

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date
}
