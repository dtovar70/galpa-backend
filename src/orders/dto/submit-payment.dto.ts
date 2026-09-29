import { Transform, type TransformFnParams } from 'class-transformer'
import { IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import { MaxInputLength } from '../../common/validation/text-limits.js'
import { ID_NUMBER_MESSAGE } from '../../common/validation/ve-formats.js'
import {
    MAX_AMOUNT_BS,
    ORDER_FIELD as FIELD,
    PAYER_ID_PATTERN,
    PAYER_PHONE_PATTERN,
    REFERENCE_DIGITS,
    REFERENCE_PATTERN,
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

/**
 * Text fields of `POST /orders/:code/payment` (multipart/form-data). The optional screenshot
 * travels in the `proof` file field. Date limits depend on the order and are checked in the
 * service.
 */
export class SubmitPaymentDto {
    /** The last 6 digits of the bank reference; spaces, dots and dashes are dropped. */
    @Transform(({ value }: TransformFnParams): unknown =>
        typeof value === 'string' ? value.replace(/[\s.-]/g, '') : value,
    )
    @IsString({ message: msg.text(FIELD.reference) })
    @MaxInputLength(FIELD.reference)
    @Matches(REFERENCE_PATTERN, { message: msg.exactDigits(FIELD.reference, REFERENCE_DIGITS) })
    reference: string

    /** Four digits here; the service checks it is an active bank of the `banks` catalog. */
    @Transform(trim)
    @Matches(/^\d{4}$/, { message: 'Elige el banco desde el que pagaste.' })
    payerBankCode: string

    @Transform(trim)
    @IsString({ message: msg.text(FIELD.payerPhone) })
    @MaxInputLength(FIELD.payerPhone)
    @Matches(PAYER_PHONE_PATTERN, { message: msg.format(FIELD.payerPhone, '0412-5550134') })
    payerPhone: string

    @IsOptional()
    @Transform(trimUpperOrUndefined)
    @IsString({ message: msg.text(FIELD.payerIdNumber) })
    @MaxInputLength(FIELD.payerIdNumber)
    @Matches(PAYER_ID_PATTERN, { message: ID_NUMBER_MESSAGE })
    payerIdNumber?: string

    @Transform(trim)
    @IsString({ message: msg.required(FIELD.paidOn) })
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: msg.format(FIELD.paidOn, 'AAAA-MM-DD') })
    paidOn: string

    @Transform(parseAmount)
    @IsNumber(
        { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
        { message: msg.money(FIELD.amountBs) },
    )
    @Min(0.01, { message: msg.min(FIELD.amountBs, 0.01) })
    @Max(MAX_AMOUNT_BS, { message: msg.max(FIELD.amountBs, MAX_AMOUNT_BS) })
    amountBs: number
}
