import { Type } from 'class-transformer'
import { ValidateNested } from 'class-validator'
import { feminine, masculine } from '../../common/validation/messages.js'
import type { ContactPageContent, ContentPlaceholder, FaqItem } from '../content.types.js'
import { CONTENT_LIST_SIZES, CONTENT_LIMITS as MAX } from './content-limits.js'
import { ContentList, ContentText } from './content-validation.js'

const FAQ_PLACEHOLDERS: readonly ContentPlaceholder[] = ['envioGratis', 'tarifaEnvio', 'despacho']

export class FaqItemDto implements FaqItem {
    @ContentText(feminine('La pregunta'), { max: MAX.question, placeholders: FAQ_PLACEHOLDERS })
    question: string

    @ContentText(feminine('La respuesta'), { max: MAX.paragraph, placeholders: FAQ_PLACEHOLDERS })
    answer: string
}

export class ContactPageContentDto implements ContactPageContent {
    @ContentText(feminine('La etiqueta de Contacto'), { max: MAX.label })
    badge: string

    @ContentText(masculine('El título de Contacto'), { max: MAX.title, highlights: true })
    title: string

    @ContentText(feminine('La introducción de Contacto'), { max: MAX.text })
    intro: string

    @ContentText(masculine('El antetítulo de las preguntas'), { max: MAX.label })
    faqEyebrow: string

    @ContentText(masculine('El título de las preguntas'), { max: MAX.title, highlights: true })
    faqTitle: string

    @ContentList(feminine('La lista de preguntas'), CONTENT_LIST_SIZES.faq)
    @ValidateNested({ each: true })
    @Type(() => FaqItemDto)
    faq: FaqItemDto[]
}
