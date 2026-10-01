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
import { Category, type DesignPrintArea } from './category.entity.js'

/** Longest garment color name ("Azul marino jaspeado"). */
export const TEMPLATE_COLOR_NAME_MAX_LENGTH = 40
/** Most garment colors (template photos) a category may offer. */
export const MAX_TEMPLATE_COLORS = 6

/**
 * "Plantilla para diseñar", one per garment color: a public photo of the blank product in that
 * color (Cloudinary folder `design-templates/`), with where the print goes on it. Every color of
 * a category shares its physical print size (`categories.design_print_*_cm`).
 *
 * The color is only what the customer sees and what the design records (`designs.color_*`): it
 * is not stock-tracked, the stock stays per product version.
 */
@Entity({ name: 'category_design_templates' })
@Index('category_design_templates_category_slug_idx', ['categorySlug', 'sortOrder'])
// Unique color name per category, ignoring case: `(category_slug, lower(color_name))`.
@Index('category_design_templates_color_name_key', { synchronize: false })
@Check('category_design_templates_color_hex_check', `"color_hex" ~ '^#[0-9A-F]{6}$'`)
@Check('category_design_templates_color_name_check', `char_length(btrim("color_name")) > 0`)
@Check('category_design_templates_size_check', `"width" > 0 AND "height" > 0`)
@Check('category_design_templates_print_area_check', `jsonb_typeof("print_area") = 'object'`)
export class CategoryDesignTemplate {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'category_design_templates_pkey' })
    id: string

    @Column({ name: 'category_slug', type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    categorySlug: string

    @ManyToOne(() => Category, (category) => category.designTemplates, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    @JoinColumn({
        name: 'category_slug',
        referencedColumnName: 'slug',
        foreignKeyConstraintName: 'category_design_templates_category_slug_fkey',
    })
    category: Relation<Category>

    /** "Blanco", "Negro"… as the customer reads it. */
    @Column({ name: 'color_name', type: 'varchar', length: TEMPLATE_COLOR_NAME_MAX_LENGTH })
    colorName: string

    /** `#RRGGBB`, uppercase: the swatch shown to the customer. */
    @Column({ name: 'color_hex', type: 'varchar', length: 7 })
    colorHex: string

    @Column({ name: 'image_url', type: 'text' })
    imageUrl: string

    /** Storage key used to delete the photo. */
    @Column({ name: 'public_id', type: 'text' })
    publicId: string

    /** Pixel size of the photo. */
    @Column({ type: 'integer' })
    width: number

    @Column({ type: 'integer' })
    height: number

    /** Where the print goes on this photo, 0..1 relative to it. */
    @Column({ name: 'print_area', type: 'jsonb' })
    printArea: DesignPrintArea

    /** Position among the category's colors; the first one is the editor's default. */
    @Column({ name: 'sort_order', type: 'integer', default: 0 })
    sortOrder: number

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date
}
