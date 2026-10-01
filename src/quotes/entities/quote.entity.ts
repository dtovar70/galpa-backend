import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    OneToMany,
    PrimaryColumn,
    UpdateDateColumn,
    type Relation,
} from 'typeorm'
import { User } from '../../auth/entities/user.entity.js'
import { TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'
import { decimalTransformer } from '../../database/decimal.transformer.js'
import { Order } from '../../orders/entities/order.entity.js'
import { QUOTE_LIMITS } from '../dto/field-names.js'
import { QUOTE_STATUSES, type QuoteStatus } from '../quote-status.js'
import { QuoteAccessLink } from './quote-access-link.entity.js'
import { QuoteItem } from './quote-item.entity.js'

/**
 * A price quote prepared by the store for a customer ("Cotización"). Amounts are in USD; the
 * bolívar total is a reference at the BCV rate of the last edit. A quote can become an order
 * (`converted_order_id`), at its own prices.
 */
@Entity({ name: 'quotes' })
@Index('quotes_code_key', ['code'], { unique: true })
@Index('quotes_status_idx', ['status'])
@Index('quotes_created_at_idx', ['createdAt'])
@Check(
    'quotes_status_check',
    `"status" IN (${QUOTE_STATUSES.map((status) => `'${status}'`).join(', ')})`,
)
@Check('quotes_notes_length_check', `char_length("notes") <= ${QUOTE_LIMITS.notes}`)
@Check('quotes_terms_length_check', `char_length("terms") <= ${QUOTE_LIMITS.terms}`)
@Check('quotes_discount_usd_check', `"discount_usd" >= 0`)
export class Quote {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'quotes_pkey' })
    id: string

    /** Human-friendly and sequential: "COT-000045" (from the `quote_code_seq` sequence). */
    @Column({ type: 'text' })
    code: string

    @Column({ type: 'text', default: 'BORRADOR' })
    status: QuoteStatus

    /** The reason given when the quote was rejected (or other status notes). */
    @Column({ name: 'status_reason', type: 'text', nullable: true })
    statusReason: string | null

    @Column({ name: 'customer_name', type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    customerName: string

    @Column({
        name: 'customer_email',
        type: 'varchar',
        length: TEXT_INPUT_MAX_LENGTH,
        nullable: true,
    })
    customerEmail: string | null

    @Column({
        name: 'customer_phone',
        type: 'varchar',
        length: TEXT_INPUT_MAX_LENGTH,
        nullable: true,
    })
    customerPhone: string | null

    @Column({
        name: 'customer_id_number',
        type: 'varchar',
        length: TEXT_INPUT_MAX_LENGTH,
        nullable: true,
    })
    customerIdNumber: string | null

    @Column({
        name: 'customer_company',
        type: 'varchar',
        length: TEXT_INPUT_MAX_LENGTH,
        nullable: true,
    })
    customerCompany: string | null

    /** Shown on the quote ("" when none). */
    @Column({ type: 'text', default: '' })
    notes: string

    /** Commercial conditions printed on the quote ("" when none). */
    @Column({ type: 'text', default: '' })
    terms: string

    /** Last day the prices hold ("YYYY-MM-DD", Caracas calendar). */
    @Column({ name: 'valid_until', type: 'date' })
    validUntil: string

    @Column({
        name: 'subtotal_usd',
        type: 'numeric',
        precision: 10,
        scale: 2,
        transformer: decimalTransformer,
    })
    subtotalUsd: number

    @Column({
        name: 'discount_usd',
        type: 'numeric',
        precision: 10,
        scale: 2,
        default: 0,
        transformer: decimalTransformer,
    })
    discountUsd: number

    @Column({
        name: 'total_usd',
        type: 'numeric',
        precision: 10,
        scale: 2,
        transformer: decimalTransformer,
    })
    totalUsd: number

    /** BCV rate (Bs per USD) of the last edit; null when no rate was stored yet. */
    @Column({
        name: 'exchange_rate',
        type: 'numeric',
        precision: 12,
        scale: 4,
        nullable: true,
        transformer: decimalTransformer,
    })
    exchangeRate: number | null

    @Column({
        name: 'total_bs',
        type: 'numeric',
        precision: 14,
        scale: 2,
        nullable: true,
        transformer: decimalTransformer,
    })
    totalBs: number | null

    @Column({ name: 'created_by', type: 'text', nullable: true })
    createdById: string | null

    @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'created_by', foreignKeyConstraintName: 'quotes_created_by_fkey' })
    createdBy: Relation<User> | null

    /** Last time it was emailed to the customer. */
    @Column({ name: 'sent_at', type: 'timestamptz', precision: 3, nullable: true })
    sentAt: Date | null

    @Column({ name: 'converted_order_id', type: 'text', nullable: true })
    convertedOrderId: string | null

    @ManyToOne(() => Order, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
    @JoinColumn({
        name: 'converted_order_id',
        foreignKeyConstraintName: 'quotes_converted_order_id_fkey',
    })
    convertedOrder: Relation<Order> | null

    /** Snapshot of the order code, kept even if the order is deleted. */
    @Column({ name: 'converted_order_code', type: 'text', nullable: true })
    convertedOrderCode: string | null

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
    updatedAt: Date

    @OneToMany(() => QuoteItem, (item) => item.quote)
    items: Relation<QuoteItem[]>

    @OneToMany(() => QuoteAccessLink, (link) => link.quote)
    accessLinks: Relation<QuoteAccessLink[]>
}
