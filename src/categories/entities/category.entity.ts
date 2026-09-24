import { Column, Entity, OneToMany, PrimaryColumn, type Relation } from 'typeorm'
import { Product } from '../../products/entities/product.entity.js'

@Entity({ name: 'categories' })
export class Category {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'categories_pkey' })
    slug: string

    @Column({ type: 'text' })
    name: string

    @Column({ type: 'text' })
    tagline: string

    @Column({ type: 'text' })
    description: string

    @Column({ name: 'color_hex', type: 'text' })
    colorHex: string

    @Column({ name: 'sort_order', type: 'integer', default: 0 })
    sortOrder: number

    @OneToMany(() => Product, (product) => product.category)
    products: Relation<Product[]>
}
