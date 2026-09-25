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
import { TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'
import { ORDER_LIMITS } from '../dto/field-names.js'
import { User } from '../../auth/entities/user.entity.js'
import { Bank } from '../../catalogs/entities/bank.entity.js'
import { decimalTransformer } from '../../database/decimal.transformer.js'
import { Order } from './order.entity.js'

export const PAYMENT_STATUSES = ['PENDIENTE', 'VERIFICADO', 'RECHAZADO'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

/** Who recorded the proof: the customer on their page, or an admin (proof sent by WhatsApp). */
export const PAYMENT_SOURCES = ['customer', 'admin'] as const
export type PaymentSource = (typeof PAYMENT_SOURCES)[number]

/** Every Pago Móvil proof recorded for an order (by the customer or an admin), rejected ones included. */

@Entity({ name: 'order_payments' })
@Index('order_payments_order_id_idx', ['orderId'])
@Index('order_payments_reference_idx', ['reference'])
@Check('order_payments_status_check', `"status" IN ('PENDIENTE', 'VERIFICADO', 'RECHAZADO')`)
@Check('order_payments_source_check', `"source" IN ('customer', 'admin')`)
@Check(
    'order_payments_rejection_reason_length_check',
    `char_length("rejection_reason") <= ${ORDER_LIMITS.reason}`,
)
export class OrderPayment {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'order_payments_pkey' })
    id: string

    @Column({ name: 'order_id', type: 'text' })
    orderId: string

    @ManyToOne(() => Order, (order) => order.payments, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    @JoinColumn({ name: 'order_id', foreignKeyConstraintName: 'order_payments_order_id_fkey' })
    order: Relation<Order>

    @Column({ type: 'text', default: 'PENDIENTE' })
    status: PaymentStatus

    /** Bank reference number (digits). */
    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    reference: string

    @Column({ name: 'payer_bank_code', type: 'varchar', length: 4 })
    payerBankCode: string

    /** A referenced bank can be deactivated but never deleted. */
    @ManyToOne(() => Bank, { onDelete: 'RESTRICT', onUpdate: 'CASCADE', nullable: false })
    @JoinColumn({
        name: 'payer_bank_code',
        foreignKeyConstraintName: 'order_payments_payer_bank_code_fkey',
    })
    payerBank: Relation<Bank>

    @Column({ name: 'payer_bank_name', type: 'text' })
    payerBankName: string

    @Column({ name: 'payer_phone', type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    payerPhone: string

    @Column({
        name: 'payer_id_number',
        type: 'varchar',
        length: TEXT_INPUT_MAX_LENGTH,
        nullable: true,
    })
    payerIdNumber: string | null

    /** Day the customer says they paid ("YYYY-MM-DD"). */
    @Column({ name: 'paid_on', type: 'date' })
    paidOn: string

    @Column({
        name: 'amount_bs',
        type: 'numeric',
        precision: 14,
        scale: 2,
        transformer: decimalTransformer,
    })
    amountBs: number

    /** The order's Bs total when the proof was sent, to flag a different amount. */
    @Column({
        name: 'expected_bs',
        type: 'numeric',
        precision: 14,
        scale: 2,
        transformer: decimalTransformer,
    })
    expectedBs: number

    /** The same reference was sent for another order that is not cancelled or expired. */
    @Column({ name: 'duplicate_reference', type: 'boolean', default: false })
    duplicateReference: boolean

    /** Private storage key of the screenshot (never a public URL); null when none was sent. */
    @Column({ name: 'proof_key', type: 'text', nullable: true, select: false })
    proofKey: string | null

    @Column({ name: 'has_proof', type: 'boolean', default: false })
    hasProof: boolean

    /** Recorded after the payment deadline, or while the order was expired. */
    @Column({ type: 'boolean', default: false })
    late: boolean

    @Column({ type: 'text', default: 'customer' })
    source: PaymentSource

    /** The admin who recorded it (source `admin`). */
    @Column({ name: 'recorded_by', type: 'text', nullable: true })
    recordedById: string | null

    @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
    @JoinColumn({
        name: 'recorded_by',
        foreignKeyConstraintName: 'order_payments_recorded_by_fkey',
    })
    recordedBy: Relation<User> | null

    @Column({ name: 'rejection_reason', type: 'text', nullable: true })
    rejectionReason: string | null

    @Column({ name: 'reviewed_at', type: 'timestamptz', precision: 3, nullable: true })
    reviewedAt: Date | null

    @Column({ name: 'reviewed_by', type: 'text', nullable: true })
    reviewedById: string | null

    @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
    @JoinColumn({
        name: 'reviewed_by',
        foreignKeyConstraintName: 'order_payments_reviewed_by_fkey',
    })
    reviewedBy: Relation<User> | null

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date
}
