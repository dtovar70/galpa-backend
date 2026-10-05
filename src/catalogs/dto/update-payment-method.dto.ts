import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import { MaxInputLength } from '../../common/validation/text-limits.js'
import { PAYMENT_METHOD_ICONS, type PaymentMethodIcon } from '../payment-method-icons.js'
import { CATALOG_DESCRIPTION_MAX_LENGTH, CATALOG_FIELD as FIELD } from './field-names.js'
import { Trim } from './trim.js'

/**
 * What the admin may change about a payment method. The code and its currency drive checkout and
 * are not accepted (the global pipe answers 400 for any other field); the position changes
 * through the reorder endpoint.
 */
export class UpdatePaymentMethodDto {
    @IsOptional()
    @Trim()
    @IsString({ message: msg.text(FIELD.paymentMethodLabel) })
    @IsNotEmpty({ message: msg.required(FIELD.paymentMethodLabel) })
    @MaxInputLength(FIELD.paymentMethodLabel)
    label?: string

    @IsOptional()
    @Trim()
    @IsString({ message: msg.text(FIELD.paymentMethodDescription) })
    @IsNotEmpty({ message: msg.required(FIELD.paymentMethodDescription) })
    @MaxLength(CATALOG_DESCRIPTION_MAX_LENGTH, {
        message: msg.maxLength(FIELD.paymentMethodDescription, CATALOG_DESCRIPTION_MAX_LENGTH),
    })
    description?: string

    @IsOptional()
    @IsIn(PAYMENT_METHOD_ICONS, { message: msg.invalid(FIELD.paymentMethodIcon) })
    icon?: PaymentMethodIcon
}
