import { masculine } from '../../common/validation/messages.js'
import type { QuotesContent } from '../content.types.js'
import { CONTENT_LIMITS as MAX, QUOTE_VALIDITY_DAYS } from './content-limits.js'
import { ContentInteger, ContentText } from './content-validation.js'

export class QuotesContentDto implements QuotesContent {
    @ContentInteger(masculine('El plazo de vigencia'), QUOTE_VALIDITY_DAYS)
    defaultValidityDays: number

    @ContentText(masculine('El texto de las condiciones'), { max: MAX.quoteTerms, optional: true })
    defaultTerms: string
}
