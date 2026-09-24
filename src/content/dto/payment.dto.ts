import { Matches } from 'class-validator'
import { feminine, masculine, msg } from '../../common/validation/messages.js'
import type { PaymentContent } from '../content.types.js'
import {
    BANK_CODE_PATTERN,
    CONTENT_LIMITS as MAX,
    ID_NUMBER_PATTERN,
    VE_MOBILE_PATTERN,
} from './content-limits.js'
import { ContentText } from './content-validation.js'

const FIELD = {
    bankCode: masculine('El código del banco'),
    bankName: masculine('El nombre del banco'),
    phone: masculine('El teléfono de Pago Móvil'),
    idNumber: feminine('La cédula o RIF'),
    holderName: masculine('El titular'),
    instructions: masculine('El texto de instrucciones'),
} as const

export class PaymentContentDto implements PaymentContent {
    @ContentText(FIELD.bankCode, { max: 4 })
    @Matches(BANK_CODE_PATTERN, { message: msg.format(FIELD.bankCode, '0102 (4 dígitos)') })
    bankCode: string

    @ContentText(FIELD.bankName, { max: MAX.bankName })
    bankName: string

    @ContentText(FIELD.phone, { max: 12 })
    @Matches(VE_MOBILE_PATTERN, { message: msg.format(FIELD.phone, '0412-5550134') })
    phone: string

    @ContentText(FIELD.idNumber, { max: 12 })
    @Matches(ID_NUMBER_PATTERN, {
        message: msg.format(FIELD.idNumber, 'V-12345678 o J-123456789'),
    })
    idNumber: string

    @ContentText(FIELD.holderName, { max: MAX.holderName })
    holderName: string

    @ContentText(FIELD.instructions, { max: MAX.instructions, optional: true })
    instructions: string
}
