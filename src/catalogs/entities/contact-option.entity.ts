import { Check, Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'
import { CONTACT_OPTION_CODE_MAX_LENGTH } from '../dto/field-names.js'

/** Same rule as `CONTACT_OPTION_CODE_PATTERN`: "ASESORIA", "AIRE_CENTRAL". */
const CODE_CHECK = `"code" ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$'`

/**
 * Columns shared by the options of the contact / advisory form. The code is generated from the
 * first label and never changes; nothing stores it (contact messages are not persisted), so an
 * option can be renamed, deactivated or deleted freely.
 */
abstract class ContactOptionColumns {
    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    label: string

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean

    @Column({ name: 'sort_order', type: 'integer', default: 0 })
    sortOrder: number

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
    updatedAt: Date
}

/** Topics of the contact form ("Asesoría para elegir un equipo"). At least one stays active. */
@Entity({ name: 'contact_topics' })
@Check('contact_topics_code_check', CODE_CHECK)
export class ContactTopicOption extends ContactOptionColumns {
    @PrimaryColumn({
        type: 'varchar',
        length: CONTACT_OPTION_CODE_MAX_LENGTH,
        primaryKeyConstraintName: 'contact_topics_pkey',
    })
    code: string
}

/** Kinds of space to climatize in an advisory request ("Residencial"). */
@Entity({ name: 'space_types' })
@Check('space_types_code_check', CODE_CHECK)
export class SpaceTypeOption extends ContactOptionColumns {
    @PrimaryColumn({
        type: 'varchar',
        length: CONTACT_OPTION_CODE_MAX_LENGTH,
        primaryKeyConstraintName: 'space_types_pkey',
    })
    code: string
}
