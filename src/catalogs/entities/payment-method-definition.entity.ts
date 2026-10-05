import { Check, Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { PAYMENT_METHODS } from '../../common/payment-methods.js'
import { TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'
import { CATALOG_DESCRIPTION_MAX_LENGTH } from '../dto/field-names.js'
import { PAYMENT_METHOD_ICONS, type PaymentMethodIcon } from '../payment-method-icons.js'

/**
 * What people see for each payment method: name, checkout help text, icon and position. The
 * codes, the currency of each method and the details it needs live in code
 * (`src/common/payment-methods.ts`), because checkout and payment validation depend on them; at
 * startup the codes of this table must be exactly `PAYMENT_METHODS` (see
 * `PaymentMethodCatalogService`).
 */
@Entity({ name: 'payment_methods' })
@Check(
    'payment_methods_code_check',
    `"code" IN (${PAYMENT_METHODS.map((method) => `'${method}'`).join(', ')})`,
)
@Check(
    'payment_methods_icon_check',
    `"icon" IN (${PAYMENT_METHOD_ICONS.map((icon) => `'${icon}'`).join(', ')})`,
)
export class PaymentMethodDefinition {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'payment_methods_pkey' })
    code: string

    /** "Pago Móvil": checkout, the order page, the panel, emails, Telegram and the receipt. */
    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    label: string

    /** One line under the name on the checkout cards. */
    @Column({ type: 'varchar', length: CATALOG_DESCRIPTION_MAX_LENGTH })
    description: string

    @Column({ type: 'varchar', length: 30 })
    icon: PaymentMethodIcon

    @Column({ name: 'sort_order', type: 'integer', default: 0 })
    sortOrder: number

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
    updatedAt: Date
}
