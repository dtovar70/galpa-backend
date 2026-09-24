import { IsEmail, Matches } from 'class-validator'
import { feminine, masculine, msg } from '../../common/validation/messages.js'
import type { ContactContent } from '../content.types.js'
import {
    CONTENT_LIMITS as MAX,
    SOCIAL_HANDLE_PATTERN,
    VE_MOBILE_PATTERN,
    VE_PHONE_PATTERN,
} from './content-limits.js'
import { ContentText } from './content-validation.js'

const FIELD = {
    email: masculine('El correo'),
    phone: masculine('El teléfono'),
    whatsapp: masculine('El número de WhatsApp'),
    city: feminine('La ciudad'),
    schedule: masculine('El horario'),
    instagram: masculine('El usuario de Instagram'),
    tiktok: masculine('El usuario de TikTok'),
} as const

const HANDLE_MESSAGE = (name: string) =>
    `${name} solo admite letras, números, puntos y guiones bajos (sin @), hasta 30 caracteres.`

export class ContactContentDto implements ContactContent {
    @ContentText(FIELD.email, { max: MAX.email })
    @IsEmail({}, { message: msg.email(FIELD.email) })
    email: string

    @ContentText(FIELD.phone, { max: 12 })
    @Matches(VE_PHONE_PATTERN, { message: msg.format(FIELD.phone, '0412-5550134') })
    phone: string

    @ContentText(FIELD.whatsapp, { max: 12 })
    @Matches(VE_MOBILE_PATTERN, { message: msg.format(FIELD.whatsapp, '0412-5550134') })
    whatsapp: string

    @ContentText(FIELD.city, { max: MAX.city })
    city: string

    @ContentText(FIELD.schedule, { max: MAX.schedule })
    schedule: string

    @ContentText(FIELD.instagram, { max: 30, optional: true })
    @Matches(SOCIAL_HANDLE_PATTERN, { message: HANDLE_MESSAGE(FIELD.instagram.name) })
    instagram: string

    @ContentText(FIELD.tiktok, { max: 30, optional: true })
    @Matches(SOCIAL_HANDLE_PATTERN, { message: HANDLE_MESSAGE(FIELD.tiktok.name) })
    tiktok: string
}
