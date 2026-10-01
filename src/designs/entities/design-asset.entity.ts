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
import type { DesignFormat } from '../design-layers.js'
import { Design } from './design.entity.js'

export const DESIGN_ASSET_KINDS = ['original', 'artwork'] as const
export type DesignAssetKind = (typeof DESIGN_ASSET_KINDS)[number]

/**
 * A private file of a design, for printing:
 * - `original`: the customer's file of one image layer (`layer_index`, its position in
 *   `designs.layers`), untouched.
 * - `artwork`: the "arte final", a transparent PNG of the print area with every layer
 *   composited at 100–200 DPI of the print size (200 unless the PNG would pass 10 MB; at most
 *   4000 px on the long side), rendered by the customer's browser. One per design (older designs have none).
 *
 * Deleted with the design (CASCADE); the stored files are deleted by the cleanup job first.
 */
@Entity({ name: 'design_assets' })
@Index('design_assets_design_id_idx', ['designId'])
@Check('design_assets_kind_check', `"kind" IN ('original', 'artwork')`)
@Check('design_assets_format_check', `"format" IN ('jpg', 'png', 'webp')`)
@Check(
    'design_assets_layer_check',
    `("kind" = 'original' AND "layer_index" >= 0) OR ("kind" = 'artwork' AND "layer_index" IS NULL AND "format" = 'png')`,
)
@Check('design_assets_size_check', `"width" > 0 AND "height" > 0 AND "bytes" > 0`)
@Check('design_assets_dpi_check', `"dpi" IS NULL OR "dpi" > 0`)
export class DesignAsset {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'design_assets_pkey' })
    id: string

    @Column({ name: 'design_id', type: 'text' })
    designId: string

    @ManyToOne(() => Design, (design) => design.assets, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    @JoinColumn({ name: 'design_id', foreignKeyConstraintName: 'design_assets_design_id_fkey' })
    design?: Relation<Design>

    @Column({ type: 'varchar', length: 16 })
    kind: DesignAssetKind

    @Column({ name: 'layer_index', type: 'integer', nullable: true })
    layerIndex: number | null

    @Column({ name: 'storage_key', type: 'text' })
    storageKey: string

    @Column({ type: 'varchar', length: 8 })
    format: DesignFormat

    @Column({ type: 'integer' })
    width: number

    @Column({ type: 'integer' })
    height: number

    @Column({ type: 'integer' })
    bytes: number

    /**
     * Print resolution: the arte final's own (100–200, lower when 200 DPI would not fit the
     * storage's 10 MB), or the original's effective DPI on the product. Null for older rows.
     */
    @Column({ type: 'integer', nullable: true })
    dpi: number | null

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date
}
