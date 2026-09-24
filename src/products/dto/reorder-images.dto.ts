import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from 'class-validator'
import { feminine, msg } from '../../common/validation/messages.js'

const IMAGE_IDS = feminine('La lista de imágenes')

export class ReorderImagesDto {
    /** Every image id of the product, in the desired display order. */
    @IsArray({ message: msg.list(IMAGE_IDS) })
    @ArrayUnique({ message: msg.listUnique(IMAGE_IDS) })
    @ArrayMaxSize(200, { message: msg.listMaxSize(IMAGE_IDS, 200) })
    @IsString({ each: true, message: 'Cada identificador de imagen debe ser un texto.' })
    imageIds: string[]
}
