import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from 'typeorm'
import { decimalTransformer } from '../../database/decimal.transformer.js'
import { Product } from './product.entity.js'

@Entity({ name: 'product_variants' })
@Index('product_variants_product_id_idx', ['productId'])
export class ProductVariant {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'product_variants_pkey' })
    id: string

    @Column({ name: 'product_id', type: 'text' })
    productId: string

    @ManyToOne(() => Product, (product) => product.variants, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    @JoinColumn({
        name: 'product_id',
        foreignKeyConstraintName: 'product_variants_product_id_fkey',
    })
    product: Relation<Product>

    @Column({ type: 'text' })
    label: string

    @Column({
        name: 'price_delta',
        type: 'numeric',
        precision: 10,
        scale: 2,
        default: 0,
        transformer: decimalTransformer,
    })
    priceDelta: number

    @Column({ name: 'color_hex', type: 'text', nullable: true })
    colorHex: string | null

    @Column({ name: 'sort_order', type: 'integer', default: 0 })
    sortOrder: number
}
