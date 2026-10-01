import { Type } from 'class-transformer'
import { IsBoolean, IsEmail, IsIn, Matches, ValidateIf, ValidateNested } from 'class-validator'
import { feminine, masculine, msg } from '../../common/validation/messages.js'
import {
    BANK_ACCOUNT_TYPES,
    type BankAccountType,
    type BinanceContent,
    type PagoMovilContent,
    type PaymentContent,
    type TransferContent,
    type ZelleContent,
} from '../content.types.js'
import {
    BANK_ACCOUNT_PATTERN,
    BANK_CODE_PATTERN,
    BINANCE_PAY_ID_PATTERN,
    CONTENT_LIMITS as MAX,
    ID_NUMBER_MESSAGE,
    ID_NUMBER_PATTERN,
    VE_MOBILE_PATTERN,
} from './content-limits.js'
import { ContentText } from './content-validation.js'

const FIELD = {
    enabled: masculine('El indicador de método activo'),
    bankCode: masculine('El código del banco'),
    bankName: masculine('El nombre del banco'),
    phone: masculine('El teléfono de Pago Móvil'),
    idNumber: feminine('La cédula o RIF'),
    holderName: masculine('El titular'),
    accountNumber: masculine('El número de cuenta'),
    accountType: masculine('El tipo de cuenta'),
    zelleEmail: masculine('El correo de Zelle'),
    payId: masculine('El Binance Pay ID'),
    binanceEmail: masculine('El correo de Binance'),
    instructions: masculine('El texto de instrucciones'),
} as const

/**
 * A method's detail is validated when the method is enabled (then it is required) or when it was
 * filled in anyway (then it must have the right format). A disabled method may keep it empty.
 */
const enabledOrFilled =
    <T extends { enabled: boolean }>(field: keyof T) =>
    (object: T): boolean =>
        object.enabled === true || object[field] !== ''

/** Same, for details that are optional even when the method is enabled. */
const filled =
    <T>(field: keyof T) =>
    (object: T): boolean =>
        object[field] !== ''

export class PagoMovilContentDto implements PagoMovilContent {
    @IsBoolean({ message: msg.boolean(FIELD.enabled) })
    enabled: boolean

    @ValidateIf(enabledOrFilled<PagoMovilContentDto>('bankCode'))
    @ContentText(FIELD.bankCode, { max: 4 })
    @Matches(BANK_CODE_PATTERN, { message: msg.format(FIELD.bankCode, '0102 (4 dígitos)') })
    bankCode: string

    /** Copied from the banks catalog by the service. */
    @ContentText(FIELD.bankName, { max: MAX.bankName, optional: true })
    bankName: string

    @ValidateIf(enabledOrFilled<PagoMovilContentDto>('phone'))
    @ContentText(FIELD.phone, { max: 12 })
    @Matches(VE_MOBILE_PATTERN, { message: msg.format(FIELD.phone, '0412-5550134') })
    phone: string

    @ValidateIf(enabledOrFilled<PagoMovilContentDto>('idNumber'))
    @ContentText(FIELD.idNumber, { max: 12 })
    @Matches(ID_NUMBER_PATTERN, { message: ID_NUMBER_MESSAGE })
    idNumber: string

    @ValidateIf(enabledOrFilled<PagoMovilContentDto>('holderName'))
    @ContentText(FIELD.holderName, { max: MAX.holderName })
    holderName: string
}

export class TransferContentDto implements TransferContent {
    @IsBoolean({ message: msg.boolean(FIELD.enabled) })
    enabled: boolean

    @ValidateIf(enabledOrFilled<TransferContentDto>('bankCode'))
    @ContentText(FIELD.bankCode, { max: 4 })
    @Matches(BANK_CODE_PATTERN, { message: msg.format(FIELD.bankCode, '0102 (4 dígitos)') })
    bankCode: string

    @ContentText(FIELD.bankName, { max: MAX.bankName, optional: true })
    bankName: string

    @ValidateIf(enabledOrFilled<TransferContentDto>('accountNumber'))
    @ContentText(FIELD.accountNumber, { max: 20 })
    @Matches(BANK_ACCOUNT_PATTERN, { message: msg.exactDigits(FIELD.accountNumber, 20) })
    accountNumber: string

    @IsIn(BANK_ACCOUNT_TYPES, { message: msg.invalid(FIELD.accountType) })
    accountType: BankAccountType

    @ValidateIf(enabledOrFilled<TransferContentDto>('idNumber'))
    @ContentText(FIELD.idNumber, { max: 12 })
    @Matches(ID_NUMBER_PATTERN, { message: ID_NUMBER_MESSAGE })
    idNumber: string

    @ValidateIf(enabledOrFilled<TransferContentDto>('holderName'))
    @ContentText(FIELD.holderName, { max: MAX.holderName })
    holderName: string
}

export class ZelleContentDto implements ZelleContent {
    @IsBoolean({ message: msg.boolean(FIELD.enabled) })
    enabled: boolean

    @ValidateIf(enabledOrFilled<ZelleContentDto>('email'))
    @ContentText(FIELD.zelleEmail, { max: MAX.email })
    @IsEmail({}, { message: msg.email(FIELD.zelleEmail) })
    email: string

    @ValidateIf(enabledOrFilled<ZelleContentDto>('holderName'))
    @ContentText(FIELD.holderName, { max: MAX.holderName })
    holderName: string
}

export class BinanceContentDto implements BinanceContent {
    @IsBoolean({ message: msg.boolean(FIELD.enabled) })
    enabled: boolean

    @ValidateIf(enabledOrFilled<BinanceContentDto>('payId'))
    @ContentText(FIELD.payId, { max: 64 })
    @Matches(BINANCE_PAY_ID_PATTERN, {
        message: 'El Binance Pay ID solo admite letras y números (4 a 64).',
    })
    payId: string

    @ValidateIf(filled<BinanceContentDto>('email'))
    @ContentText(FIELD.binanceEmail, { max: MAX.email })
    @IsEmail({}, { message: msg.email(FIELD.binanceEmail) })
    email: string

    @ContentText(FIELD.holderName, { max: MAX.holderName, optional: true })
    holderName: string
}

export class PaymentContentDto implements PaymentContent {
    @ContentText(FIELD.instructions, { max: MAX.instructions, optional: true })
    instructions: string

    @ValidateNested()
    @Type(() => PagoMovilContentDto)
    pagoMovil: PagoMovilContentDto

    @ValidateNested()
    @Type(() => TransferContentDto)
    transfer: TransferContentDto

    @ValidateNested()
    @Type(() => ZelleContentDto)
    zelle: ZelleContentDto

    @ValidateNested()
    @Type(() => BinanceContentDto)
    binance: BinanceContentDto
}
