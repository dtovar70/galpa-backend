import {
    ArgumentsHost,
    BadRequestException,
    Catch,
    type ExceptionFilter,
    HttpException,
    PayloadTooLargeException,
} from '@nestjs/common'
import type { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { MAX_IMAGE_DIMENSIONS_TEXT } from '../storage/image-size.js'
import { ALLOWED_IMAGE_MIME_TYPES } from '../storage/image-type.js'
import { MAX_TEMPLATE_COLORS } from './entities/category-design-template.entity.js'

/** Multipart field of the template photo (a new color, or a color's replaced photo). */
export const TEMPLATE_FILE_FIELD = 'file'
export const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024
/** Smallest accepted side of the template photo, in pixels. */
export const MIN_TEMPLATE_SIDE = 600

const MAX_MB = MAX_TEMPLATE_BYTES / (1024 * 1024)

export const TEMPLATE_MESSAGES = {
    missing: 'Adjunta la foto de la plantilla.',
    invalidType: 'La foto de la plantilla debe ser JPG, PNG o WEBP.',
    tooSmall: `La foto de la plantilla debe medir al menos ${MIN_TEMPLATE_SIDE} px en su lado más corto.`,
    tooLarge: `La foto de la plantilla puede pesar como máximo ${MAX_MB} MB.`,
    tooManyPixels: `La foto de la plantilla es demasiado grande: puede medir como máximo ${MAX_IMAGE_DIMENSIONS_TEXT}.`,
    uploadFailed: 'No pudimos guardar la foto de la plantilla. Intenta de nuevo.',
    noColor: 'No encontramos este color de la plantilla.',
    tooManyColors: `Puedes ofrecer como máximo ${MAX_TEMPLATE_COLORS} colores por categoría. Quita uno para agregar otro.`,
    colorsMismatch:
        'La lista debe incluir exactamente todos los colores de la plantilla, cada uno una sola vez.',
    areaOutside: 'El área de impresión debe quedar dentro de la foto.',
} as const

/** "Ya tienes un color llamado «Negro» en esta plantilla." */
export function duplicateColorMessage(name: string): string {
    return `Ya tienes un color llamado «${name}» en esta plantilla.`
}

/** A 400 pinned on `field` (the photo by default), in the usual `{ message, details }` shape. */
export function templateFieldError(
    message: string,
    field: string = TEMPLATE_FILE_FIELD,
): BadRequestException {
    return new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message,
        details: [{ field, errors: [message] }],
    })
}

type UploadOptions = NonNullable<Parameters<typeof FileInterceptor>[1]>

const imageFilter: UploadOptions['fileFilter'] = (_req, file, callback) => {
    if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) callback(null, true)
    else callback(templateFieldError(TEMPLATE_MESSAGES.invalidType), false)
}

/** Replacing a color's photo: one image of at most 10 MB and no text fields (bytes checked later). */
export const TEMPLATE_UPLOAD_OPTIONS: UploadOptions = {
    limits: { fileSize: MAX_TEMPLATE_BYTES, files: 1, fields: 0 },
    fileFilter: imageFilter,
}

/** A new color: its photo plus the `colorName` and `colorHex` text fields. */
export const TEMPLATE_COLOR_UPLOAD_OPTIONS: UploadOptions = {
    limits: { fileSize: MAX_TEMPLATE_BYTES, files: 1, fields: 2, fieldSize: 200 },
    fileFilter: imageFilter,
}

const MULTER_MESSAGES: Record<string, string> = {
    'File too large': TEMPLATE_MESSAGES.tooLarge,
    'Too many files': 'Envía una sola foto.',
    'Field value too long': 'El nombre o el código del color es demasiado largo.',
    'Too many fields': `Envía solo la foto en el campo "${TEMPLATE_FILE_FIELD}" (y, para un color nuevo, su nombre y su código).`,
    'Unexpected field': `Envía la foto en el campo "${TEMPLATE_FILE_FIELD}".`,
    'Multipart: Boundary not found': 'La solicitud debe enviarse como multipart/form-data.',
}

/** Translates Multer's English limit errors, keeping the usual `{ message, details }` body. */
@Catch(PayloadTooLargeException, BadRequestException)
export class TemplateUploadErrorsFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>()
        const status = exception.getStatus()
        const translated = MULTER_MESSAGES[exception.message]
        response.status(status).json(
            translated
                ? {
                      statusCode: status,
                      error: exception.name,
                      message: translated,
                      details: [{ field: TEMPLATE_FILE_FIELD, errors: [translated] }],
                  }
                : exception.getResponse(),
        )
    }
}
