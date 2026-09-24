import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from 'class-validator'
import { feminine, msg } from '../../common/validation/messages.js'

const SLUGS = feminine('La lista de categorías')
const SLUGS_MAX_SIZE = 200

export class ReorderCategoriesDto {
    /** Every category slug, in the desired menu order. */
    @IsArray({ message: msg.list(SLUGS) })
    @ArrayUnique({ message: msg.listUnique(SLUGS) })
    @ArrayMaxSize(SLUGS_MAX_SIZE, { message: msg.listMaxSize(SLUGS, SLUGS_MAX_SIZE) })
    @IsString({ each: true, message: 'Cada slug de categoría debe ser un texto.' })
    slugs: string[]
}
