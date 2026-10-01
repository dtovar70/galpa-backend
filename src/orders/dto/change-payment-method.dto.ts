import { IsIn } from 'class-validator'
import { PAYMENT_METHODS, type PaymentMethod } from '../../common/payment-methods.js'
import { msg } from '../../common/validation/messages.js'
import { ORDER_FIELD as FIELD } from './field-names.js'

/** Body of `PATCH /orders/:code/payment-method`. */
export class ChangePaymentMethodDto {
    @IsIn(PAYMENT_METHODS, { message: msg.invalid(FIELD.paymentMethod) })
    method: PaymentMethod
}
