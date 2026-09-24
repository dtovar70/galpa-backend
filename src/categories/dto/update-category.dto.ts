import { OmitType, PartialType } from '@nestjs/mapped-types'
import { CreateCategoryDto } from './create-category.dto.js'

/** Every field is optional; the slug is the category's identity and cannot be changed. */
export class UpdateCategoryDto extends PartialType(
    OmitType(CreateCategoryDto, ['slug'] as const),
) {}
