import { Transform, Type, type TransformFnParams } from 'class-transformer'
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsNotEmpty,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    ValidateNested,
} from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import {
    MAX_TEMPLATE_COLORS,
    TEMPLATE_COLOR_NAME_MAX_LENGTH,
} from '../entities/category-design-template.entity.js'
import { DESIGN_TEMPLATE_FIELD as F, DesignPrintAreaDto } from './update-design-template.dto.js'

/** `#RRGGBB` (the color picker's format). Stored uppercase. */
export const TEMPLATE_COLOR_HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/
const HEX_MESSAGE = 'El color debe tener formato hexadecimal de 6 dígitos, por ejemplo #1F2937.'

/** Trims and collapses inner spaces: "  Azul   marino " -> "Azul marino". */
const cleanName = ({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value

const upperHex = ({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim().toUpperCase() : value

/**
 * Text fields of `POST /admin/categories/:slug/design-template/colors` (multipart/form-data,
 * next to the `file` photo).
 */
export class CreateTemplateColorDto {
    @Transform(cleanName)
    @IsString({ message: msg.text(F.colorName) })
    @IsNotEmpty({ message: msg.required(F.colorName) })
    @MaxLength(TEMPLATE_COLOR_NAME_MAX_LENGTH, {
        message: msg.maxLength(F.colorName, TEMPLATE_COLOR_NAME_MAX_LENGTH),
    })
    colorName: string

    @Transform(upperHex)
    @IsString({ message: msg.text(F.colorHex) })
    @Matches(TEMPLATE_COLOR_HEX_PATTERN, { message: HEX_MESSAGE })
    colorHex: string
}

/**
 * `PATCH /admin/categories/:slug/design-template/colors/:colorId`: any of its name, swatch and
 * print area. That the area stays inside the photo is checked by the service.
 */
export class UpdateTemplateColorDto {
    @IsOptional()
    @Transform(cleanName)
    @IsString({ message: msg.text(F.colorName) })
    @IsNotEmpty({ message: msg.required(F.colorName) })
    @MaxLength(TEMPLATE_COLOR_NAME_MAX_LENGTH, {
        message: msg.maxLength(F.colorName, TEMPLATE_COLOR_NAME_MAX_LENGTH),
    })
    colorName?: string

    @IsOptional()
    @Transform(upperHex)
    @IsString({ message: msg.text(F.colorHex) })
    @Matches(TEMPLATE_COLOR_HEX_PATTERN, { message: HEX_MESSAGE })
    colorHex?: string

    @IsOptional()
    @ValidateNested({ message: msg.invalid(F.printArea) })
    @Type(() => DesignPrintAreaDto)
    printArea?: DesignPrintAreaDto
}

/** `PATCH /admin/categories/:slug/design-template/colors/order`. */
export class ReorderTemplateColorsDto {
    /** Every color id of the category, in the desired order. */
    @IsArray({ message: msg.list(F.colorIds) })
    @ArrayUnique({ message: msg.listUnique(F.colorIds) })
    @ArrayMaxSize(MAX_TEMPLATE_COLORS, {
        message: msg.listMaxSize(F.colorIds, MAX_TEMPLATE_COLORS),
    })
    @IsString({ each: true, message: 'Cada identificador de color debe ser un texto.' })
    colorIds: string[]
}
