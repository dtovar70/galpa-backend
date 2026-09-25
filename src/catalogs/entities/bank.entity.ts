import { Check, Column, Entity, PrimaryColumn } from 'typeorm'
import { TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'

/**
 * Venezuelan banks that take Pago Móvil, by their four-digit code ("0102"). Used by the Pago
 * Móvil content section and the payment proofs. Inactive banks are hidden from the selects and
 * refused for new payments; a bank that is referenced can only be deactivated, never deleted.
 */
@Entity({ name: 'banks' })
@Check('banks_code_check', `"code" ~ '^[0-9]{4}$'`)
export class Bank {
    @PrimaryColumn({ type: 'varchar', length: 4, primaryKeyConstraintName: 'banks_pkey' })
    code: string

    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    name: string

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean

    @Column({ name: 'sort_order', type: 'integer', default: 0 })
    sortOrder: number
}
