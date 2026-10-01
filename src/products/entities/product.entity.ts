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
import { TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'
import {
    PRODUCT_DESCRIPTION_MAX_LENGTH,
    PRODUCT_MAX_HIGHLIGHTS,
    PRODUCT_MAX_SPECS,
    STOCK_MODES,
    type StockMode,
} from '../products.constants.js'
import { Category } from '../../categories/entities/category.entity.js'
import { decimalTransformer } from '../../database/decimal.transformer.js'
import { ProductImage } from './product-image.entity.js'
import { ProductVariant } from './product-variant.entity.js'

/** One row of the "ficha técnica". */
export interface ProductSpec {
    label: string
    value: string
}

@Entity({ name: 'products' })
@Index('products_slug_key', ['slug'], { unique: true })
@Index('products_category_slug_idx', ['categorySlug'])
@Index('products_is_active_relevance_score_idx', ['isActive', 'relevanceScore'])
@Index('products_brand_idx', ['brand'])
@Index('products_sku_key', ['sku'], { unique: true, where: `"sku" IS NOT NULL` })
@Check(
    'products_stock_mode_check',
    `"stock_mode" IN (${STOCK_MODES.map((mode) => `'${mode}'`).join(', ')})`,
)
@Check('products_lead_time_days_check', `"lead_time_days" >= 0`)
@Check('products_btu_check', `"btu" > 0`)
@Check(
    'products_specs_check',
    `jsonb_typeof("specs") = 'array' AND jsonb_array_length("specs") <= ${PRODUCT_MAX_SPECS}`,
)
@Check(
    'products_description_length_check',
    `char_length("description") <= ${PRODUCT_DESCRIPTION_MAX_LENGTH}`,
)
@Check('products_highlights_count_check', `cardinality("highlights") <= ${PRODUCT_MAX_HIGHLIGHTS}`)
/** `max_text_array_item_length(text[])` is created by the InitialSchema migration. */
@Check(
    'products_highlights_length_check',
    `max_text_array_item_length("highlights") <= ${TEXT_INPUT_MAX_LENGTH}`,
)
export class Product {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'products_pkey' })
    id: string

    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    slug: string

    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    name: string

    @Column({ name: 'category_slug', type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    categorySlug: string

    @ManyToOne(() => Category, (category) => category.products, {
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
    })
    @JoinColumn({
        name: 'category_slug',
        referencedColumnName: 'slug',
        foreignKeyConstraintName: 'products_category_slug_fkey',
    })
    category: Relation<Category>

    @Column({ type: 'numeric', precision: 10, scale: 2, transformer: decimalTransformer })
    price: number

    @Column({
        name: 'compare_at_price',
        type: 'numeric',
        precision: 10,
        scale: 2,
        nullable: true,
        transformer: decimalTransformer,
    })
    compareAtPrice: number | null

    /** Manufacturer ("Daikin", "LG"); required, also for spare parts and accessories. */
    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    brand: string

    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH, nullable: true })
    model: string | null

    /** Internal code; unique while set (partial index `products_sku_key`). */
    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH, nullable: true })
    sku: string | null

    /**
     * `STOCK`: sold from the counted units. `ON_ORDER` ("bajo pedido"): ordered from the supplier
     * after the sale, so its stock is never checked, taken nor restored.
     */
    @Column({ name: 'stock_mode', type: 'text', default: 'STOCK' })
    stockMode: StockMode

    /** Days an ON_ORDER product takes to arrive; null when unknown. */
    @Column({ name: 'lead_time_days', type: 'integer', nullable: true })
    leadTimeDays: number | null

    /** Cooling capacity of air conditioners; null for parts and accessories. */
    @Column({ type: 'integer', nullable: true })
    btu: number | null

    /** "110V", "220V", "208-230V" (free text). */
    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH, nullable: true })
    voltage: string | null

    @Column({ name: 'is_inverter', type: 'boolean', nullable: true })
    isInverter: boolean | null

    /** "R410A", "R32". */
    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH, nullable: true })
    refrigerant: string | null

    /** "Ficha técnica": ordered label/value rows. */
    @Column({ type: 'jsonb', default: () => "'[]'" })
    specs: ProductSpec[]

    @Column({ type: 'text' })
    description: string

    @Column({ type: 'text', array: true, default: () => "'{}'" })
    highlights: string[]

    /** Allowed values: nuevo, bestseller, oferta (validated in the API layer). */
    @Column({ type: 'text', array: true, default: () => "'{}'" })
    tags: string[]

    /**
     * Units in stock. With variants it is derived: the sum of `product_variants.stock`, kept in
     * sync inside the same transaction that changes them (see product-stock.ts). Only products
     * without variants hold their own count here. Ignored for ON_ORDER products.
     */
    @Column({ type: 'integer', default: 0 })
    stock: number

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean

    /** Derived: lowercased, accent-stripped name/brand/model/sku/description/tags for search. */
    @Column({ name: 'search_text', type: 'text', default: '' })
    searchText: string

    /** Derived: bestseller(+10) + nuevo(+4). Backs the "relevance" sort. */
    @Column({ name: 'relevance_score', type: 'double precision', default: 0 })
    relevanceScore: number

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
    updatedAt: Date

    @OneToMany(() => ProductVariant, (variant) => variant.product)
    variants: Relation<ProductVariant[]>

    @OneToMany(() => ProductImage, (image) => image.product)
    images: Relation<ProductImage[]>
}
