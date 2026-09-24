import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import {
    FEATURED_LIMIT,
    MAX_FEATURED_LIMIT,
    MAX_RELATED_LIMIT,
    RELATED_LIMIT,
} from '../products.constants.js'
import { FIELD } from './field-names.js'

/** `GET /products/featured?limit=` */
export class FeaturedQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: msg.integer(FIELD.limit) })
    @Min(1, { message: msg.min(FIELD.limit, 1) })
    @Max(MAX_FEATURED_LIMIT, { message: msg.max(FIELD.limit, MAX_FEATURED_LIMIT) })
    limit: number = FEATURED_LIMIT
}

/** `GET /products/:slug/related?limit=` */
export class RelatedQueryDto {
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: msg.integer(FIELD.limit) })
    @Min(1, { message: msg.min(FIELD.limit, 1) })
    @Max(MAX_RELATED_LIMIT, { message: msg.max(FIELD.limit, MAX_RELATED_LIMIT) })
    limit: number = RELATED_LIMIT
}
