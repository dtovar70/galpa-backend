import { Check, Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'
import { QUOTE_STATUSES } from '../../quotes/quote-status.js'
import { BADGE_TONES, type BadgeTone } from '../badge-tones.js'
import { CATALOG_DESCRIPTION_MAX_LENGTH } from '../dto/field-names.js'

/**
 * What people see for each quote status: label, help text and badge color. The codes themselves
 * and the allowed transitions live in code (`src/quotes/quote-status.ts`), because editing,
 * sending, converting and expiry depend on them; at startup the codes of this table must be
 * exactly `QUOTE_STATUSES` (see `QuoteStatusCatalogService`).
 */
@Entity({ name: 'quote_statuses' })
@Check(
    'quote_statuses_code_check',
    `"code" IN (${QUOTE_STATUSES.map((status) => `'${status}'`).join(', ')})`,
)
@Check(
    'quote_statuses_tone_check',
    `"tone" IN (${BADGE_TONES.map((tone) => `'${tone}'`).join(', ')})`,
)
export class QuoteStatusDefinition {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'quote_statuses_pkey' })
    code: string

    /** Admin label: badges, the status filter, the "Cambiar estado" dialog. */
    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    label: string

    /** Short help text: what the status means and what can still be done. */
    @Column({ type: 'varchar', length: CATALOG_DESCRIPTION_MAX_LENGTH })
    description: string

    @Column({ type: 'varchar', length: 20 })
    tone: BadgeTone

    @Column({ name: 'sort_order', type: 'integer', default: 0 })
    sortOrder: number

    /** Informational: the quote's workflow ends here. */
    @Column({ name: 'is_terminal', type: 'boolean', default: false })
    isTerminal: boolean

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
    updatedAt: Date
}
