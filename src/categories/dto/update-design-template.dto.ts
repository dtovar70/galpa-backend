import { IsNumber, Max, Min } from 'class-validator'
import { feminine, masculine, msg } from '../../common/validation/messages.js'

/** Smallest side of the print area, relative to the photo (5 %). */
export const PRINT_AREA_MIN_SIZE = 0.05
/** Print size bounds, in cm (the column is numeric(6,2) with a CHECK of 0 < cm ≤ 100). */
export const PRINT_CM_MIN = 0.5
export const PRINT_CM_MAX = 100

export const DESIGN_TEMPLATE_FIELD = {
    printArea: masculine('El área de impresión'),
    x: feminine('La posición horizontal del área'),
    y: feminine('La posición vertical del área'),
    width: masculine('El ancho del área'),
    height: masculine('El alto del área'),
    printWidthCm: masculine('El ancho de impresión (cm)'),
    printHeightCm: masculine('El alto de impresión (cm)'),
    colorName: masculine('El nombre del color'),
    colorHex: masculine('El color'),
    colorIds: feminine('La lista de colores'),
} as const

export const NUMBER = { allowNaN: false, allowInfinity: false }
const F = DESIGN_TEMPLATE_FIELD

/** Relative to the template photo: (0, 0) is its top-left corner and 1 its full width/height. */
export class DesignPrintAreaDto {
    @IsNumber(NUMBER, { message: msg.number(F.x) })
    @Min(0, { message: msg.notNegative(F.x) })
    @Max(1, { message: msg.max(F.x, 1) })
    x: number

    @IsNumber(NUMBER, { message: msg.number(F.y) })
    @Min(0, { message: msg.notNegative(F.y) })
    @Max(1, { message: msg.max(F.y, 1) })
    y: number

    @IsNumber(NUMBER, { message: msg.number(F.width) })
    @Min(PRINT_AREA_MIN_SIZE, { message: msg.min(F.width, PRINT_AREA_MIN_SIZE) })
    @Max(1, { message: msg.max(F.width, 1) })
    width: number

    @IsNumber(NUMBER, { message: msg.number(F.height) })
    @Min(PRINT_AREA_MIN_SIZE, { message: msg.min(F.height, PRINT_AREA_MIN_SIZE) })
    @Max(1, { message: msg.max(F.height, 1) })
    height: number
}

/**
 * `PATCH /admin/categories/:slug/design-template`: the physical print size, shared by every
 * garment color. Each color's print area is saved with the color (UpdateTemplateColorDto).
 */
export class UpdateDesignTemplateDto {
    @IsNumber({ maxDecimalPlaces: 2, ...NUMBER }, { message: msg.money(F.printWidthCm) })
    @Min(PRINT_CM_MIN, { message: msg.min(F.printWidthCm, PRINT_CM_MIN) })
    @Max(PRINT_CM_MAX, { message: msg.max(F.printWidthCm, PRINT_CM_MAX) })
    printWidthCm: number

    @IsNumber({ maxDecimalPlaces: 2, ...NUMBER }, { message: msg.money(F.printHeightCm) })
    @Min(PRINT_CM_MIN, { message: msg.min(F.printHeightCm, PRINT_CM_MIN) })
    @Max(PRINT_CM_MAX, { message: msg.max(F.printHeightCm, PRINT_CM_MAX) })
    printHeightCm: number
}
