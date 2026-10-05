import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from 'class-validator'
import { PAYMENT_METHODS } from '../../common/payment-methods.js'
import { msg } from '../../common/validation/messages.js'
import { CATALOG_FIELD as FIELD } from './field-names.js'

export class ReorderPaymentMethodsDto {
    /** Every payment method code, in the order checkout offers them. */
    @IsArray({ message: msg.list(FIELD.paymentMethodCodes) })
    @ArrayUnique({ message: msg.listUnique(FIELD.paymentMethodCodes) })
    @ArrayMaxSize(PAYMENT_METHODS.length, {
        message: msg.listMaxSize(FIELD.paymentMethodCodes, PAYMENT_METHODS.length),
    })
    @IsString({ each: true, message: 'Cada código de método de pago debe ser un texto.' })
    codes: string[]
}
