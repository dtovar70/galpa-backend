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
import { CATALOG_CODE_MAX_LENGTH } from '../../catalogs/dto/field-names.js'
import { OrderStatusDefinition } from '../../catalogs/entities/order-status-definition.entity.js'
import type { ActorKind, OrderStatus } from '../order-status.js'
import { Order } from './order.entity.js'

/** Audit trail of every status change (the creation is the first entry, `from` = null). */

@Entity({ name: 'order_status_history' })
@Index('order_status_history_order_id_idx', ['orderId'])
@Check(
    'order_status_history_actor_type_check',
    `"actor_type" IN ('admin', 'customer', 'system', 'telegram')`,
)
export class OrderStatusHistory {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'order_status_history_pkey' })
    id: string

    @Column({ name: 'order_id', type: 'text' })
    orderId: string

    @ManyToOne(() => Order, (order) => order.history, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    @JoinColumn({
        name: 'order_id',
        foreignKeyConstraintName: 'order_status_history_order_id_fkey',
    })
    order: Relation<Order>

    @Column({
        name: 'from_status',
        type: 'varchar',
        length: CATALOG_CODE_MAX_LENGTH,
        nullable: true,
    })
    fromStatus: OrderStatus | null

    @ManyToOne(() => OrderStatusDefinition, {
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        nullable: true,
    })
    @JoinColumn({
        name: 'from_status',
        foreignKeyConstraintName: 'order_status_history_from_status_fkey',
    })
    fromStatusDefinition: Relation<OrderStatusDefinition> | null

    @Column({ name: 'to_status', type: 'varchar', length: CATALOG_CODE_MAX_LENGTH })
    toStatus: OrderStatus

    @ManyToOne(() => OrderStatusDefinition, {
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        nullable: false,
    })
    @JoinColumn({
        name: 'to_status',
        foreignKeyConstraintName: 'order_status_history_to_status_fkey',
    })
    toStatusDefinition: Relation<OrderStatusDefinition>

    /** 'admin' | 'customer' | 'system' | 'telegram'. */
    @Column({ name: 'actor_type', type: 'text' })
    actorType: ActorKind

    /** The admin user, for admin actions (null otherwise or once the user is deleted). */
    @Column({ name: 'actor_user_id', type: 'text', nullable: true })
    actorUserId: string | null

    @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
    @JoinColumn({
        name: 'actor_user_id',
        foreignKeyConstraintName: 'order_status_history_actor_user_id_fkey',
    })
    actorUser: Relation<User> | null

    /** Reason (rejection, cancellation) or note (shipping agency/tracking). */
    @Column({ type: 'text', nullable: true })
    note: string | null

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date
}
