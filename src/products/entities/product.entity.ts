import {
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
import { Category } from '../../categories/entities/category.entity.js'
import { decimalTransformer } from '../../database/decimal.transformer.js'
import { ProductImage } from './product-image.entity.js'
import { ProductVariant } from './product-variant.entity.js'

@Entity({ name: 'products' })
@Index('products_slug_key', ['slug'], { unique: true })
@Index('products_category_slug_idx', ['categorySlug'])
@Index('products_is_active_relevance_score_idx', ['isActive', 'relevanceScore'])
export class Product {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'products_pkey' })
    id: string

    @Column({ type: 'text' })
    slug: string

    @Column({ type: 'text' })
    name: string

    @Column({ name: 'category_slug', type: 'text' })
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

    @Column({ name: 'print_text', type: 'text' })
    printText: string

    @Column({ name: 'color_hex', type: 'text' })
    colorHex: string

    @Column({ type: 'text' })
    description: string

    @Column({ type: 'text', array: true, default: () => "'{}'" })
    highlights: string[]

    /** Allowed values: nuevo, bestseller, oferta, personalizable (validated in the API layer). */
    @Column({ type: 'text', array: true, default: () => "'{}'" })
    tags: string[]

    @Column({ type: 'double precision', default: 0 })
    rating: number

    @Column({ name: 'review_count', type: 'integer', default: 0 })
    reviewCount: number

    @Column({ type: 'integer', default: 0 })
    stock: number

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean

    /** Derived: lowercased, accent-stripped name/description/printText/tags for search. */
    @Column({ name: 'search_text', type: 'text', default: '' })
    searchText: string

    /** Derived: bestseller(+10) + nuevo(+4) + rating. Backs the "relevance" sort. */
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
