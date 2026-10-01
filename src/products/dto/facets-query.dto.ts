import { IsOptional, Matches } from 'class-validator'
import { SLUG_PATTERN } from '../../common/utils/text.util.js'
import { msg } from '../../common/validation/messages.js'
import { FIELD } from './field-names.js'

/** `GET /products/facets?category=<slug>`. */
export class FacetsQueryDto {
    @IsOptional()
    @Matches(SLUG_PATTERN, { message: msg.invalid(FIELD.category) })
    category?: string
}
