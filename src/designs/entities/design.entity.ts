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
    type Relation,
} from 'typeorm'
import { Product } from '../../products/entities/product.entity.js'
import type { DesignLayer } from '../design-layers.js'
import { DesignAsset } from './design-asset.entity.js'

export { DESIGN_FORMATS, type DesignFormat } from '../design-layers.js'

/** The print area size a design was made for (from the category template), in cm. */
export interface DesignPrintSize {
    widthCm: number
    heightCm: number
}

/** The garment color a design was made on (see `Design.colorName`). */
export interface DesignColor {
    name: string
    hex: string
}

/** The design's garment color, or null (illustration template, or an older design). */
export function designColorOf(
    design: Pick<Design, 'colorName' | 'colorHex'> | null | undefined,
): DesignColor | null {
    return design?.colorName && design.colorHex
        ? { name: design.colorName, hex: design.colorHex }
        : null
}

/**
 * A customer's own design on a personalizable product ("Diseña con tu imagen"): up to 5 images
 * and 3 texts (`layers`) placed on the print area. Uploaded before checkout, so it starts
 * unattached; checkout attaches it to one order line (`order_items.design_id`, `attached_at`).
 * Unattached designs older than 7 days are deleted, files included, by DesignCleanupService.
 *
 * Every file is private (storage keys, never URLs): the mockup preview here, and in
 * `design_assets` the original of each image layer and the print-ready "arte final". The preview
 * is readable by whoever holds the token returned at upload (only its hash is kept here), by the
 * order's private link once ordered, and by the admins.
 */
@Entity({ name: 'designs' })
@Index('designs_product_id_idx', ['productId'])
@Index('designs_attached_at_created_at_idx', ['attachedAt', 'createdAt'])
@Check('designs_preview_token_hash_check', `"preview_token_hash" ~ '^[a-f0-9]{64}$'`)
@Check(
    'designs_color_check',
    `("color_name" IS NULL AND "color_hex" IS NULL) OR ("color_name" IS NOT NULL AND "color_hex" IS NOT NULL)`,
)
@Check('designs_layers_check', `jsonb_typeof("layers") = 'array'`)
export class Design {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'designs_pkey' })
    id: string

    /** Null once the product is deleted (the design is then never attachable). */
    @Column({ name: 'product_id', type: 'text', nullable: true })
    productId: string | null

    @ManyToOne(() => Product, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'product_id', foreignKeyConstraintName: 'designs_product_id_fkey' })
    product: Relation<Product> | null

    /** The variant it was designed on (its color); no foreign key, like order_items. */
    @Column({ name: 'variant_id', type: 'text', nullable: true })
    variantId: string | null

    /** PNG of the mockup with every layer placed, rendered by the customer's browser. */
    @Column({ name: 'preview_key', type: 'text' })
    previewKey: string

    /** Bottom to top; validated by the API (see `parseRequestedLayers`). */
    @Column({ type: 'jsonb' })
    layers: DesignLayer[]

    @Column({ name: 'print_size', type: 'jsonb' })
    printSize: DesignPrintSize

    /**
     * The garment color chosen in the editor ("Negro", `#1F2937`), copied from the category's
     * template color so it survives the admin renaming or removing it. Null with an
     * illustration template (no colors). Not stock-tracked.
     */
    @Column({ name: 'color_name', type: 'varchar', length: 40, nullable: true })
    colorName: string | null

    @Column({ name: 'color_hex', type: 'varchar', length: 7, nullable: true })
    colorHex: string | null

    /** The lowest DPI among the image layers (see `estimateDpi`); null with only text. */
    @Column({ name: 'dpi_estimate', type: 'integer', nullable: true })
    dpiEstimate: number | null

    /** SHA-256 (hex) of the preview token handed to the customer's browser. */
    @Column({ name: 'preview_token_hash', type: 'text', select: false })
    previewTokenHash: string

    /** Set when checkout attaches it to an order line; null while it only lives in a cart. */
    @Column({ name: 'attached_at', type: 'timestamptz', precision: 3, nullable: true })
    attachedAt: Date | null

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date

    @OneToMany(() => DesignAsset, (asset) => asset.design)
    assets?: Relation<DesignAsset>[]
}
