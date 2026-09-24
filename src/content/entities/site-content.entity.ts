import {
    Column,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryColumn,
    UpdateDateColumn,
    type Relation,
} from 'typeorm'
import { User } from '../../auth/entities/user.entity.js'
import type { ContentSection } from '../content.types.js'

/**
 * One row per edited section of the site content. Sections without a row render the built-in
 * defaults (`content.defaults.ts`), and stored values are merged over them.
 */
@Entity({ name: 'site_content' })
export class SiteContentEntry {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'site_content_pkey' })
    key: ContentSection

    @Column({ type: 'jsonb' })
    value: Record<string, unknown>

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
    updatedAt: Date

    /** Kept when the user is deleted (the column becomes null). */
    @Column({ name: 'updated_by', type: 'text', nullable: true })
    updatedById: string | null

    @ManyToOne(() => User, { onDelete: 'SET NULL', onUpdate: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'updated_by', foreignKeyConstraintName: 'site_content_updated_by_fkey' })
    updatedBy: Relation<User> | null
}
