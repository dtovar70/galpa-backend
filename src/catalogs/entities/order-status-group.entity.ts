import { Column, Entity, OneToMany, PrimaryColumn, type Relation } from 'typeorm'
import { TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'
import { CATALOG_CODE_MAX_LENGTH, CATALOG_DESCRIPTION_MAX_LENGTH } from '../dto/field-names.js'
import { OrderStatusDefinition } from './order-status-definition.entity.js'

/**
 * A tab of the admin orders page ("Por verificar", "Por pagar"…). Its label, description and
 * position are editable; which statuses belong to it is not (see `order_statuses.group_code`).
 */
@Entity({ name: 'order_status_groups' })
export class OrderStatusGroup {
    @PrimaryColumn({
        type: 'varchar',
        length: CATALOG_CODE_MAX_LENGTH,
        primaryKeyConstraintName: 'order_status_groups_pkey',
    })
    code: string

    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    label: string

    /** Shown when the tab has no orders. */
    @Column({ type: 'varchar', length: CATALOG_DESCRIPTION_MAX_LENGTH, nullable: true })
    description: string | null

    @Column({ name: 'sort_order', type: 'integer', default: 0 })
    sortOrder: number

    /** The tab's counter stands out while it is above zero ("Por verificar"). */
    @Column({ type: 'boolean', default: false })
    highlight: boolean

    @OneToMany(() => OrderStatusDefinition, (status) => status.group)
    statuses: Relation<OrderStatusDefinition[]>
}
