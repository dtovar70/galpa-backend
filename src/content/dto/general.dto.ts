import { feminine, masculine } from '../../common/validation/messages.js'
import type { GeneralContent } from '../content.types.js'
import { CONTENT_LIMITS as MAX } from './content-limits.js'
import { ContentText } from './content-validation.js'

export class GeneralContentDto implements GeneralContent {
    @ContentText(masculine('El nombre de la marca'), { max: MAX.brandName })
    brandName: string

    @ContentText(masculine('El eslogan'), { max: MAX.tagline })
    tagline: string

    @ContentText(feminine('La descripción corta'), { max: MAX.text })
    description: string

    @ContentText(masculine('El complemento del título'), { max: MAX.titleSuffix, optional: true })
    titleSuffix: string

    @ContentText(feminine('La descripción para buscadores'), {
        max: MAX.metaDescription,
        placeholders: ['envioGratis'],
    })
    metaDescription: string

    @ContentText(masculine('El texto del buscador'), { max: MAX.searchPlaceholder })
    searchPlaceholder: string
}
