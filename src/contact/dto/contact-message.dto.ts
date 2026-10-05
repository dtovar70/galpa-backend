import { Transform, Type, type TransformFnParams } from 'class-transformer'
import {
    IsEmail,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateIf,
} from 'class-validator'
import { SLUG_PATTERN } from '../../common/utils/text.util.js'
import { msg } from '../../common/validation/messages.js'
import { MaxInputLength } from '../../common/validation/text-limits.js'
import { VE_MOBILE_PATTERN } from '../../common/validation/ve-formats.js'
import { CONTACT_OPTION_CODE_PATTERN } from '../../catalogs/contact-options.service.js'
import { CONTACT_OPTION_CODE_MAX_LENGTH } from '../../catalogs/dto/field-names.js'
import { CONTACT_FIELD as FIELD, CONTACT_LIMITS as LIMITS } from '../contact.constants.js'

const trim = ({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value

/** Empty strings are treated as "not sent" for optional fields. */
const trimOrUndefined = ({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
}

/** Validates the customer's name, sent as `name` (or as `fullName`, the older field). */
const NameRules = (): PropertyDecorator[] => [
    Transform(trim),
    IsString({ message: msg.text(FIELD.fullName) }),
    MinLength(LIMITS.fullName.min, { message: 'Escribe tu nombre y apellido.' }),
    MaxLength(LIMITS.fullName.max, { message: msg.maxLength(FIELD.fullName, LIMITS.fullName.max) }),
]

function applyAll(decorators: PropertyDecorator[]): PropertyDecorator {
    return (target, property) => decorators.forEach((decorator) => decorator(target, property))
}

/** Body of `POST /contact`: the storefront's contact / advisory form. */
export class ContactMessageDto {
    /** Required unless `fullName` is sent instead. */
    @ValidateIf((dto: ContactMessageDto) => dto.fullName === undefined || dto.name !== undefined)
    @applyAll(NameRules())
    name?: string

    /** The same as `name` (accepted for older storefront builds). */
    @IsOptional()
    @applyAll(NameRules())
    fullName?: string

    @Transform(trim)
    @IsString({ message: msg.text(FIELD.email) })
    @IsEmail({}, { message: msg.email(FIELD.email) })
    @MaxLength(LIMITS.email, { message: msg.maxLength(FIELD.email, LIMITS.email) })
    email: string

    /** Optional WhatsApp: a Venezuelan mobile, like the checkout phone. */
    @IsOptional()
    @Transform(trimOrUndefined)
    @IsString({ message: msg.text(FIELD.phone) })
    @MaxInputLength(FIELD.phone)
    @Matches(VE_MOBILE_PATTERN, {
        message: 'Escribe un celular válido, por ejemplo 0412-5550134.',
    })
    phone?: string

    /** Code of an active topic (`GET /catalogs/contact-options`); checked by the service. */
    @IsString({ message: msg.invalid(FIELD.topic) })
    @MaxLength(CONTACT_OPTION_CODE_MAX_LENGTH, { message: msg.invalid(FIELD.topic) })
    @Matches(CONTACT_OPTION_CODE_PATTERN, { message: msg.invalid(FIELD.topic) })
    topic: string

    /** Code of an active space type; checked by the service. Empty means not sent. */
    @IsOptional()
    @Transform(trimOrUndefined)
    @IsString({ message: msg.invalid(FIELD.spaceType) })
    @MaxLength(CONTACT_OPTION_CODE_MAX_LENGTH, { message: msg.invalid(FIELD.spaceType) })
    @Matches(CONTACT_OPTION_CODE_PATTERN, { message: msg.invalid(FIELD.spaceType) })
    spaceType?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: msg.integer(FIELD.areaM2) })
    @Min(LIMITS.areaM2.min, { message: msg.min(FIELD.areaM2, LIMITS.areaM2.min) })
    @Max(LIMITS.areaM2.max, { message: msg.max(FIELD.areaM2, LIMITS.areaM2.max) })
    areaM2?: number

    /** The product page the customer wrote from; unknown slugs are ignored. */
    @IsOptional()
    @Transform(trimOrUndefined)
    @MaxLength(LIMITS.productSlug, {
        message: msg.maxLength(FIELD.productSlug, LIMITS.productSlug),
    })
    @Matches(SLUG_PATTERN, { message: msg.invalid(FIELD.productSlug) })
    productSlug?: string

    @Transform(trim)
    @IsString({ message: msg.text(FIELD.message) })
    @MinLength(LIMITS.message.min, {
        message: `Cuéntanos un poco más, al menos ${LIMITS.message.min} caracteres.`,
    })
    @MaxLength(LIMITS.message.max, { message: msg.maxLength(FIELD.message, LIMITS.message.max) })
    message: string

    /** Honeypot: a hidden input people never fill. A value means a bot (dropped silently). */
    @IsOptional()
    @IsString({ message: msg.text(FIELD.website) })
    @MaxLength(LIMITS.website, { message: msg.maxLength(FIELD.website, LIMITS.website) })
    website?: string
}
