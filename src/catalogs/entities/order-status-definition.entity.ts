import { Check, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, type Relation } from 'typeorm'
import { TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'
import { BADGE_TONES, type BadgeTone } from '../badge-tones.js'
import {
    CATALOG_CODE_MAX_LENGTH,
    CATALOG_DESCRIPTION_MAX_LENGTH,
    WHATSAPP_TEMPLATE_MAX_LENGTH,
} from '../dto/field-names.js'
import { OrderStatusGroup } from './order-status-group.entity.js'

/**
 * What people see for each order status: labels, customer copy and badge color. The codes
 * themselves and the allowed transitions live in code (`src/orders/order-status.ts`), because
 * stock, refunds, expiry and events depend on them; at startup the codes of this table must be
 * exactly `ORDER_STATUSES` (see `OrderStatusCatalogService`).
 */
@Entity({ name: 'order_statuses' })
@Check(
    'order_statuses_tone_check',
    `"tone" IN (${BADGE_TONES.map((tone) => `'${tone}'`).join(', ')})`,
)
@Check(
    'order_statuses_whatsapp_template_length_check',
    `char_length("whatsapp_template") BETWEEN 1 AND ${WHATSAPP_TEMPLATE_MAX_LENGTH}`,
)
export class OrderStatusDefinition {
    @PrimaryColumn({
        type: 'varchar',
        length: CATALOG_CODE_MAX_LENGTH,
        primaryKeyConstraintName: 'order_statuses_pkey',
    })
    code: string

    /** Admin label: badges, tabs, the status filter, history. */
    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    label: string

    /** Name of the step on the customer's order timeline. */
    @Column({ name: 'customer_label', type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    customerLabel: string

    /** Heading of the message on the customer's order page. */
    @Column({
        name: 'customer_title',
        type: 'varchar',
        length: TEXT_INPUT_MAX_LENGTH,
        nullable: true,
    })
    customerTitle: string | null

    /** Body of that message; may use `{produccion}` and `{marca}`. */
    @Column({
        name: 'customer_description',
        type: 'varchar',
        length: CATALOG_DESCRIPTION_MAX_LENGTH,
        nullable: true,
    })
    customerDescription: string | null

    @Column({ name: 'group_code', type: 'varchar', length: CATALOG_CODE_MAX_LENGTH })
    groupCode: string

    @ManyToOne(() => OrderStatusGroup, (group) => group.statuses, {
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
    })
    @JoinColumn({ name: 'group_code', foreignKeyConstraintName: 'order_statuses_group_code_fkey' })
    group: Relation<OrderStatusGroup>

    @Column({ type: 'varchar', length: 20 })
    tone: BadgeTone

    @Column({ name: 'sort_order', type: 'integer', default: 0 })
    sortOrder: number

    /**
     * The message the owner sends the customer by WhatsApp while the order is in this status
     * ("Avisar por WhatsApp"). Placeholders (`{nombre}`, `{pedido}`, `{enlace}`…) are filled in by
     * `renderWhatsAppTemplate`; the admin edits it in Catálogos.
     */
    @Column({ name: 'whatsapp_template', type: 'text' })
    whatsappTemplate: string

    /** Informational: the order's workflow ends here (it may still be reactivated by code rules). */
    @Column({ name: 'is_terminal', type: 'boolean', default: false })
    isTerminal: boolean
}
