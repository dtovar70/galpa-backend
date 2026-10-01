import { Transform, type TransformFnParams } from 'class-transformer'
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { feminine, masculine, msg } from '../../common/validation/messages.js'

export const DESIGN_FIELD = {
    productId: masculine('El producto'),
    variantId: feminine('La variante'),
    templateColorId: masculine('El color del producto'),
    layers: feminine('La lista de capas del diseño'),
} as const

/** Generous bounds: a layer may hang well off the area, but not absurdly. */
export const PLACEMENT_LIMITS = {
    offset: 5,
    scale: { min: 0.02, max: 20 },
    rotation: 360,
} as const

/** Room for 8 layers with their texts (the JSON is validated by `parseRequestedLayers`). */
export const MAX_LAYERS_JSON_LENGTH = 8_000

const trim = ({ value }: TransformFnParams): unknown =>
    typeof value === 'string' ? value.trim() : value

const trimOrUndefined = ({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
}

/**
 * Text fields of `POST /designs` (multipart/form-data), next to the `originals` images, the
 * `artwork` PNG and the `preview` PNG.
 */
export class CreateDesignDto {
    @Transform(trim)
    @IsString({ message: msg.text(DESIGN_FIELD.productId) })
    @IsNotEmpty({ message: msg.required(DESIGN_FIELD.productId) })
    @MaxLength(80, { message: msg.maxLength(DESIGN_FIELD.productId, 80) })
    productId: string

    @IsOptional()
    @Transform(trimOrUndefined)
    @IsString({ message: msg.text(DESIGN_FIELD.variantId) })
    @MaxLength(80, { message: msg.maxLength(DESIGN_FIELD.variantId, 80) })
    variantId?: string

    /**
     * The garment color (template photo) the design was made on. Required when the product's
     * category has template photos; not used with an illustration template.
     */
    @IsOptional()
    @Transform(trimOrUndefined)
    @IsString({ message: msg.text(DESIGN_FIELD.templateColorId) })
    @MaxLength(80, { message: msg.maxLength(DESIGN_FIELD.templateColorId, 80) })
    templateColorId?: string

    /** JSON array of layers (see RequestedLayer), bottom to top by `z`. */
    @IsString({ message: msg.text(DESIGN_FIELD.layers) })
    @IsNotEmpty({ message: msg.required(DESIGN_FIELD.layers) })
    @MaxLength(MAX_LAYERS_JSON_LENGTH, {
        message: msg.maxLength(DESIGN_FIELD.layers, MAX_LAYERS_JSON_LENGTH),
    })
    layers: string
}
