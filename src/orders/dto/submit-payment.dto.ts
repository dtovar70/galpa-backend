import { Transform, type TransformFnParams } from 'class-transformer'
import {
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    Matches,
    Max,
    Min,
    registerDecorator,
    ValidateIf,
    type ValidationArguments,
} from 'class-validator'
import {
    isPaymentMethod,
    PAYMENT_METHODS,
    paysInBolivars,
    type PaymentMethod,
} from '../../common/payment-methods.js'
import { msg } from '../../common/validation/messages.js'
import { MaxInputLength } from '../../common/validation/text-limits.js'
import { ID_NUMBER_MESSAGE } from '../../common/validation/ve-formats.js'
import {
    BINANCE_ACCOUNT_PATTERN,
    MAX_AMOUNT_BS,
    MAX_AMOUNT_USD,
    ORDER_FIELD as FIELD,
    PAYER_ID_PATTERN,
    PAYER_PHONE_PATTERN,
    REFERENCE_RULES,
    ZELLE_ACCOUNT_PATTERN,
} from './field-names.js'

const trim = ({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value

const trimUpperOrUndefined = ({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim().toUpperCase()
    return trimmed === '' ? undefined : trimmed
}

/** Multipart sends text: "1.234,56" or "1234.56" -> 1234.56; anything else stays as sent. */
export function parseAmount({ value }: TransformFnParams): unknown {
    if (typeof value !== 'string') return value
    const text = value.trim().replace(/\s/g, '')
    if (text === '') return value
    const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text
    return /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : value
}

/** References are compared without spaces, dots or dashes, and in uppercase. */
export function normalizeReference({ value }: TransformFnParams): unknown {
    return typeof value === 'string' ? value.replace(/[\s.-]/g, '').toUpperCase() : value
}

type PaymentBody = { method?: unknown }

const methodOf = (object: object): PaymentMethod | null => {
    const method = (object as PaymentBody).method
    return isPaymentMethod(method) ? method : null
}

/** Validates the field only when the body's method is one of `methods`. */
const forMethods =
    (...methods: PaymentMethod[]) =>
    (object: object): boolean => {
        const method = methodOf(object)
        return method !== null && methods.includes(method)
    }

const inBolivars = (object: object): boolean => {
    const method = methodOf(object)
    return method !== null && paysInBolivars(method)
}

const inDollars = (object: object): boolean => {
    const method = methodOf(object)
    return method !== null && !paysInBolivars(method)
}

/** The reference format of the body's method (see `REFERENCE_RULES`). */
function IsPaymentReference(): PropertyDecorator {
    return (target, propertyName) => {
        registerDecorator({
            name: 'paymentReference',
            target: target.constructor,
            propertyName: String(propertyName),
            validator: {
                validate: (value: unknown, args?: ValidationArguments) => {
                    const method = args ? methodOf(args.object) : null
                    // Without a valid method there is nothing to compare with (`method` fails).
                    if (!method) return true
                    return typeof value === 'string' && REFERENCE_RULES[method].pattern.test(value)
                },
                defaultMessage: (args?: ValidationArguments) => {
                    const method = args ? methodOf(args.object) : null
                    return method ? REFERENCE_RULES[method].message : msg.invalid(FIELD.reference)
                },
            },
        })
    }
}

/** Zelle: an email or a phone; Binance: a Pay ID or an email. */
const PAYER_ACCOUNT_RULES: Partial<Record<PaymentMethod, { pattern: RegExp; message: string }>> = {
    ZELLE: {
        pattern: ZELLE_ACCOUNT_PATTERN,
        message: 'Escribe el correo o el teléfono con el que hiciste el Zelle.',
    },
    BINANCE: {
        pattern: BINANCE_ACCOUNT_PATTERN,
        message: 'Escribe tu Binance Pay ID o el correo de tu cuenta Binance.',
    },
}

function IsPayerAccount(): PropertyDecorator {
    return (target, propertyName) => {
        registerDecorator({
            name: 'payerAccount',
            target: target.constructor,
            propertyName: String(propertyName),
            validator: {
                validate: (value: unknown, args?: ValidationArguments) => {
                    const method = args ? methodOf(args.object) : null
                    const rule = method ? PAYER_ACCOUNT_RULES[method] : undefined
                    return !rule || (typeof value === 'string' && rule.pattern.test(value))
                },
                defaultMessage: (args?: ValidationArguments) => {
                    const method = args ? methodOf(args.object) : null
                    return (
                        (method ? PAYER_ACCOUNT_RULES[method]?.message : undefined) ??
                        msg.invalid(FIELD.payerAccount)
                    )
                },
            },
        })
    }
}

/**
 * Text fields of `POST /orders/:code/payment` (multipart/form-data), also used by the admin's
 * manual payment. Which fields are required depends on `method`:
 * - PAGO_MOVIL: payerBankCode, payerPhone, amountBs (payerIdNumber optional)
 * - TRANSFERENCIA: payerBankCode, amountBs (payerIdNumber optional)
 * - ZELLE: payerName, payerAccount (email or phone), amountUsd
 * - BINANCE: payerAccount (Pay ID or email), amountUsd
 * Fields of other methods are ignored. The optional screenshot travels in the `proof` file
 * field. Date limits depend on the order and are checked in the service.
 */
export class SubmitPaymentDto {
    @IsIn(PAYMENT_METHODS, { message: msg.invalid(FIELD.method) })
    method: PaymentMethod

    @Transform(normalizeReference)
    @IsString({ message: msg.text(FIELD.reference) })
    @MaxInputLength(FIELD.reference)
    @IsPaymentReference()
    reference: string

    /** Four digits here; the service checks it is an active bank of the `banks` catalog. */
    @ValidateIf(inBolivars)
    @Transform(trim)
    @Matches(/^\d{4}$/, { message: 'Elige el banco desde el que pagaste.' })
    payerBankCode?: string

    @ValidateIf(forMethods('PAGO_MOVIL'))
    @Transform(trim)
    @IsString({ message: msg.text(FIELD.payerPhone) })
    @MaxInputLength(FIELD.payerPhone)
    @Matches(PAYER_PHONE_PATTERN, { message: msg.format(FIELD.payerPhone, '0412-5550134') })
    payerPhone?: string

    @IsOptional()
    @Transform(trimUpperOrUndefined)
    @IsString({ message: msg.text(FIELD.payerIdNumber) })
    @MaxInputLength(FIELD.payerIdNumber)
    @Matches(PAYER_ID_PATTERN, { message: ID_NUMBER_MESSAGE })
    payerIdNumber?: string

    @ValidateIf(forMethods('ZELLE'))
    @Transform(trim)
    @IsString({ message: msg.text(FIELD.payerName) })
    @IsNotEmpty({ message: msg.required(FIELD.payerName) })
    @MaxInputLength(FIELD.payerName)
    payerName?: string

    @ValidateIf(forMethods('ZELLE', 'BINANCE'))
    @Transform(trim)
    @IsString({ message: msg.text(FIELD.payerAccount) })
    @MaxInputLength(FIELD.payerAccount)
    @IsPayerAccount()
    payerAccount?: string

    @Transform(trim)
    @IsString({ message: msg.required(FIELD.paidOn) })
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: msg.format(FIELD.paidOn, 'AAAA-MM-DD') })
    paidOn: string

    @ValidateIf(inBolivars)
    @Transform(parseAmount)
    @IsNumber(
        { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
        { message: msg.money(FIELD.amountBs) },
    )
    @Min(0.01, { message: msg.min(FIELD.amountBs, 0.01) })
    @Max(MAX_AMOUNT_BS, { message: msg.max(FIELD.amountBs, MAX_AMOUNT_BS) })
    amountBs?: number

    @ValidateIf(inDollars)
    @Transform(parseAmount)
    @IsNumber(
        { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
        { message: msg.money(FIELD.amountUsd) },
    )
    @Min(0.01, { message: msg.min(FIELD.amountUsd, 0.01) })
    @Max(MAX_AMOUNT_USD, { message: msg.max(FIELD.amountUsd, MAX_AMOUNT_USD) })
    amountUsd?: number
}
