import {
    type ValidationArguments,
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    ValidateBy,
    ValidateIf,
} from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import { MaxInputLength } from '../../common/validation/text-limits.js'
import { whatsAppTemplateError } from '../../orders/whatsapp/whatsapp-template.js'
import { BADGE_TONES, type BadgeTone } from '../badge-tones.js'
import {
    CATALOG_DESCRIPTION_MAX_LENGTH,
    CATALOG_FIELD as FIELD,
    WHATSAPP_TEMPLATE_MAX_LENGTH,
} from './field-names.js'
import { Trim } from './trim.js'

/** Placeholders the customer message may use, filled in by the storefront. */
export const CUSTOMER_MESSAGE_PLACEHOLDERS = ['despacho', 'marca'] as const

const ONLY_KNOWN_PLACEHOLDERS = new RegExp(
    `^(?:[^{}]|\\{(?:${CUSTOMER_MESSAGE_PLACEHOLDERS.join('|')})\\})*$`,
)

/** Only known `{placeholders}` (the per-status `{comprobante}` rule is checked by the service). */
function KnownWhatsAppPlaceholders(): PropertyDecorator {
    return ValidateBy({
        name: 'knownWhatsAppPlaceholders',
        validator: {
            validate: (value: unknown) =>
                typeof value !== 'string' || whatsAppTemplateError(value) === null,
            defaultMessage: (args?: ValidationArguments) =>
                whatsAppTemplateError(String(args?.value ?? '')) ?? '',
        },
    })
}

/**
 * What the admin may change about an order status. The code, its group and `isTerminal` drive
 * behavior and are not accepted (the global pipe answers 400 for any other field).
 */
export class UpdateOrderStatusDto {
    @IsOptional()
    @Trim()
    @IsString({ message: msg.text(FIELD.statusLabel) })
    @IsNotEmpty({ message: msg.required(FIELD.statusLabel) })
    @MaxInputLength(FIELD.statusLabel)
    label?: string

    @IsOptional()
    @Trim()
    @IsString({ message: msg.text(FIELD.customerLabel) })
    @IsNotEmpty({ message: msg.required(FIELD.customerLabel) })
    @MaxInputLength(FIELD.customerLabel)
    customerLabel?: string

    /** Null or "" clears it (the customer page then shows the customer label). */
    @IsOptional()
    @Trim()
    @ValidateIf((_dto, value) => value !== null)
    @IsString({ message: msg.text(FIELD.customerTitle) })
    @MaxInputLength(FIELD.customerTitle)
    customerTitle?: string | null

    @IsOptional()
    @Trim()
    @ValidateIf((_dto, value) => value !== null)
    @IsString({ message: msg.text(FIELD.customerDescription) })
    @MaxLength(CATALOG_DESCRIPTION_MAX_LENGTH, {
        message: msg.maxLength(FIELD.customerDescription, CATALOG_DESCRIPTION_MAX_LENGTH),
    })
    @Matches(ONLY_KNOWN_PLACEHOLDERS, {
        message: 'El mensaje al cliente solo admite los marcadores {despacho} y {marca}.',
    })
    customerDescription?: string | null

    @IsOptional()
    @IsIn(BADGE_TONES, { message: msg.invalid(FIELD.tone) })
    tone?: BadgeTone

    /** The "Avisar por WhatsApp" message of this status (a textarea, 1–1000 characters). */
    @IsOptional()
    @Trim()
    @IsString({ message: msg.text(FIELD.whatsappTemplate) })
    @IsNotEmpty({ message: msg.required(FIELD.whatsappTemplate) })
    @MaxLength(WHATSAPP_TEMPLATE_MAX_LENGTH, {
        message: msg.maxLength(FIELD.whatsappTemplate, WHATSAPP_TEMPLATE_MAX_LENGTH),
    })
    @KnownWhatsAppPlaceholders()
    whatsappTemplate?: string
}
