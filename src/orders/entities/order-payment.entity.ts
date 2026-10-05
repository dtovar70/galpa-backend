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
import { PaymentMethodDefinition } from '../../catalogs/entities/payment-method-definition.entity.js'
import { PAYMENT_METHODS, type PaymentMethod } from '../../common/payment-methods.js'
import { decimalTransformer } from '../../database/decimal.transformer.js'
import { Order } from './order.entity.js'

export const PAYMENT_STATUSES = ['PENDIENTE', 'VERIFICADO', 'RECHAZADO'] as const
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number]

/** Who recorded the proof: the customer on their page, or an admin (proof sent by WhatsApp). */
export const PAYMENT_SOURCES = ['customer', 'admin'] as const
export type PaymentSource = (typeof PAYMENT_SOURCES)[number]

const methodList = (methods: readonly PaymentMethod[]) =>
    methods.map((method) => `'${method}'`).join(', ')

/**
 * Every payment proof recorded for an order (by the customer or an admin), rejected ones
 * included. Bolívar methods (Pago Móvil, transfer) carry the Bs amounts; dollar methods (Zelle,
 * Binance) the USD ones. Fields that do not apply to the method are null.
 */
@Entity({ name: 'order_payments' })
@Index('order_payments_order_id_idx', ['orderId'])
@Index('order_payments_method_reference_idx', ['method', 'reference'])
@Check('order_payments_status_check', `"status" IN ('PENDIENTE', 'VERIFICADO', 'RECHAZADO')`)
@Check('order_payments_method_check', `"method" IN (${methodList(PAYMENT_METHODS)})`)
@Check(
    'order_payments_amounts_check',
    `("method" IN (${methodList(['PAGO_MOVIL', 'TRANSFERENCIA'])}) AND "amount_bs" IS NOT NULL AND "expected_bs" IS NOT NULL) OR ("method" IN (${methodList(['ZELLE', 'BINANCE'])}) AND "amount_usd" IS NOT NULL AND "expected_usd" IS NOT NULL)`,
)
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

    @Column({ type: 'text' })
    method: PaymentMethod

    /** The method's catalog row (name, icon). The foreign key keeps every payment on a known method. */
    @ManyToOne(() => PaymentMethodDefinition, {
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
        nullable: false,
    })
    @JoinColumn({ name: 'method', foreignKeyConstraintName: 'order_payments_method_fkey' })
    methodDefinition: Relation<PaymentMethodDefinition>

    /**
     * Bank reference (digits) for Pago Móvil and transfers; Zelle confirmation or Binance order
     * id (letters and digits, uppercased) otherwise.
     */
    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    reference: string

    /** Pago Móvil and transfers. */
    @Column({ name: 'payer_bank_code', type: 'varchar', length: 4, nullable: true })
    payerBankCode: string | null

    /** A referenced bank can be deactivated but never deleted. */
    @ManyToOne(() => Bank, { onDelete: 'RESTRICT', onUpdate: 'CASCADE', nullable: true })
    @JoinColumn({
        name: 'payer_bank_code',
        foreignKeyConstraintName: 'order_payments_payer_bank_code_fkey',
    })
    payerBank: Relation<Bank> | null

    @Column({ name: 'payer_bank_name', type: 'text', nullable: true })
    payerBankName: string | null

    /** Pago Móvil only. */
    @Column({ name: 'payer_phone', type: 'varchar', length: TEXT_INPUT_MAX_LENGTH, nullable: true })
    payerPhone: string | null

    @Column({
        name: 'payer_id_number',
        type: 'varchar',
        length: TEXT_INPUT_MAX_LENGTH,
        nullable: true,
    })
    payerIdNumber: string | null

    /** Zelle: the account holder's name. */
    @Column({ name: 'payer_name', type: 'varchar', length: TEXT_INPUT_MAX_LENGTH, nullable: true })
    payerName: string | null

    /** Zelle: email or phone used; Binance: Pay ID or email. */
    @Column({
        name: 'payer_account',
        type: 'varchar',
        length: TEXT_INPUT_MAX_LENGTH,
        nullable: true,
    })
    payerAccount: string | null

    /** Day the customer says they paid ("YYYY-MM-DD"). */
    @Column({ name: 'paid_on', type: 'date' })
    paidOn: string

    @Column({
        name: 'amount_bs',
        type: 'numeric',
        precision: 14,
        scale: 2,
        nullable: true,
        transformer: decimalTransformer,
    })
    amountBs: number | null

    /** The order's Bs total when the proof was sent, to flag a different amount. */
    @Column({
        name: 'expected_bs',
        type: 'numeric',
        precision: 14,
        scale: 2,
        nullable: true,
        transformer: decimalTransformer,
    })
    expectedBs: number | null

    /** Zelle and Binance: dollars paid. */
    @Column({
        name: 'amount_usd',
        type: 'numeric',
        precision: 10,
        scale: 2,
        nullable: true,
        transformer: decimalTransformer,
    })
    amountUsd: number | null

    /** The order's USD total when the proof was sent. */
    @Column({
        name: 'expected_usd',
        type: 'numeric',
        precision: 10,
        scale: 2,
        nullable: true,
        transformer: decimalTransformer,
    })
    expectedUsd: number | null

    /**
     * The same reference was sent with the same method for another order that is not cancelled
     * or expired.
     */
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
