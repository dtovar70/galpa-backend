import {
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
import { Product } from './product.entity.js'

@Entity({ name: 'product_images' })
@Index('product_images_product_id_idx', ['productId'])
export class ProductImage {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'product_images_pkey' })
    id: string

    @Column({ name: 'product_id', type: 'text' })
    productId: string

    @ManyToOne(() => Product, (product) => product.images, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    @JoinColumn({ name: 'product_id', foreignKeyConstraintName: 'product_images_product_id_fkey' })
    product: Relation<Product>

    @Column({ type: 'text' })
    url: string

    /** Storage key used to delete the file (Cloudinary public_id or local relative path). */
    @Column({ name: 'public_id', type: 'text' })
    publicId: string

    /** The product name when uploaded. */
    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH, nullable: true })
    alt: string | null

    @Column({ name: 'sort_order', type: 'integer', default: 0 })
    sortOrder: number

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date
}
