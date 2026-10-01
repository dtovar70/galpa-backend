import { Transform, type TransformFnParams } from 'class-transformer'
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import { MaxInputLength } from '../../common/validation/text-limits.js'
import { VE_MOBILE_PATTERN } from '../../common/validation/ve-formats.js'
import {
    CONTACT_FIELD as FIELD,
    CONTACT_LIMITS as LIMITS,
    CONTACT_TOPICS,
    type ContactTopic,
} from '../contact.constants.js'

const trim = ({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value

/** Empty strings are treated as "not sent" for optional fields. */
const trimOrUndefined = ({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
}

/** Body of `POST /contact`: the storefront's contact form (same rules as its zod schema). */
export class ContactMessageDto {
    @Transform(trim)
    @IsString({ message: msg.text(FIELD.fullName) })
    @MinLength(LIMITS.fullName.min, { message: 'Escribe tu nombre y apellido.' })
    @MaxLength(LIMITS.fullName.max, { message: msg.maxLength(FIELD.fullName, LIMITS.fullName.max) })
    fullName: string

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

    @IsIn(CONTACT_TOPICS, { message: msg.invalid(FIELD.topic) })
    topic: ContactTopic

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
