import {
    Check,
    Column,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryColumn,
    type Relation,
} from 'typeorm'
import { TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'
import { decimalTransformer } from '../../database/decimal.transformer.js'
import { Product } from '../../products/entities/product.entity.js'
import { QUOTE_LIMITS } from '../dto/field-names.js'
import { Quote } from './quote.entity.js'

/**
 * One line of a quote: a catalog product (its details copied when the line was saved) or a
 * free-text line (installation, materials…) without product. Prices are the quote's own.
 */
@Entity({ name: 'quote_items' })
@Index('quote_items_quote_id_idx', ['quoteId'])
@Check('quote_items_quantity_check', `"quantity" > 0`)
@Check('quote_items_unit_price_usd_check', `"unit_price_usd" >= 0`)
@Check(
    'quote_items_description_length_check',
    `char_length("description") <= ${QUOTE_LIMITS.description}`,
)
export class QuoteItem {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'quote_items_pkey' })
    id: string

    @Column({ name: 'quote_id', type: 'text' })
    quoteId: string

    @ManyToOne(() => Quote, (quote) => quote.items, { onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn({ name: 'quote_id', foreignKeyConstraintName: 'quote_items_quote_id_fkey' })
    quote: Relation<Quote>

    /** Null for a free-text line, or once the product is deleted. */
    @Column({ name: 'product_id', type: 'text', nullable: true })
    productId: string | null

    @ManyToOne(() => Product, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'product_id', foreignKeyConstraintName: 'quote_items_product_id_fkey' })
    product: Relation<Product> | null

    /** The chosen version of a product with variants (no foreign key, like order lines). */
    @Column({ name: 'variant_id', type: 'text', nullable: true })
    variantId: string | null

    @Column({ name: 'product_slug', type: 'text', nullable: true })
    productSlug: string | null

    @Column({ type: 'text' })
    description: string

    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH, nullable: true })
    brand: string | null

    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH, nullable: true })
    model: string | null

    @Column({ type: 'integer' })
    quantity: number

    @Column({
        name: 'unit_price_usd',
        type: 'numeric',
        precision: 10,
        scale: 2,
        transformer: decimalTransformer,
    })
    unitPriceUsd: number

    @Column({
        name: 'line_total_usd',
        type: 'numeric',
        precision: 12,
        scale: 2,
        transformer: decimalTransformer,
    })
    lineTotalUsd: number

    @Column({ name: 'sort_order', type: 'integer', default: 0 })
    sortOrder: number
}
