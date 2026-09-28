import { Check, Column, Entity, PrimaryColumn } from 'typeorm'

/**
 * Venezuelan mobile operator codes ("0424") offered by the phone fields: WhatsApp and Pago Móvil
 * in the content, the checkout phone and the payment proofs. Phones stay stored as text
 * ("0424-1234567"), so there is no foreign key: an inactive code is refused for new saves only,
 * and values already stored with it keep showing.
 */
@Entity({ name: 'mobile_prefixes' })
@Check('mobile_prefixes_code_check', `"code" ~ '^04[0-9]{2}$'`)
export class MobilePrefix {
    @PrimaryColumn({ type: 'varchar', length: 4, primaryKeyConstraintName: 'mobile_prefixes_pkey' })
    code: string

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean

    @Column({ name: 'sort_order', type: 'integer', default: 0 })
    sortOrder: number
}
