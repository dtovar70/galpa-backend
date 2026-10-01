import { Check, Column, Entity, OneToMany, PrimaryColumn, type Relation } from 'typeorm'
import { TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'
import { decimalTransformer } from '../../database/decimal.transformer.js'
import { CATEGORY_DESCRIPTION_MAX_LENGTH } from '../dto/field-names.js'
import { Product } from '../../products/entities/product.entity.js'
import { CategoryDesignTemplate } from './category-design-template.entity.js'

/** A rectangle on a template photo, each value relative to the photo's size (0..1). */
export interface DesignPrintArea {
    x: number
    y: number
    width: number
    height: number
}

@Entity({ name: 'categories' })
@Check(
    'categories_description_length_check',
    `char_length("description") <= ${CATEGORY_DESCRIPTION_MAX_LENGTH}`,
)
@Check(
    'categories_design_print_size_check',
    `("design_print_width_cm" IS NULL AND "design_print_height_cm" IS NULL) OR ("design_print_width_cm" > 0 AND "design_print_width_cm" <= 100 AND "design_print_height_cm" > 0 AND "design_print_height_cm" <= 100)`,
)
export class Category {
    @PrimaryColumn({
        type: 'varchar',
        length: TEXT_INPUT_MAX_LENGTH,
        primaryKeyConstraintName: 'categories_pkey',
    })
    slug: string

    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    name: string

    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    tagline: string

    @Column({ type: 'text' })
    description: string

    @Column({ name: 'color_hex', type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    colorHex: string

    @Column({ name: 'sort_order', type: 'integer', default: 0 })
    sortOrder: number

    /**
     * Physical print size, shared by every garment color (template photo); overrides the
     * hardcoded illustration templates. Both or none.
     */
    @Column({
        name: 'design_print_width_cm',
        type: 'numeric',
        precision: 6,
        scale: 2,
        nullable: true,
        transformer: decimalTransformer,
    })
    designPrintWidthCm: number | null

    @Column({
        name: 'design_print_height_cm',
        type: 'numeric',
        precision: 6,
        scale: 2,
        nullable: true,
        transformer: decimalTransformer,
    })
    designPrintHeightCm: number | null

    @OneToMany(() => Product, (product) => product.category)
    products: Relation<Product[]>

    /** "Plantilla para diseñar": one photo per garment color. */
    @OneToMany(() => CategoryDesignTemplate, (template) => template.category)
    designTemplates: Relation<CategoryDesignTemplate[]>
}
