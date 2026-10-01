import {
    ArgumentsHost,
    BadRequestException,
    Catch,
    type ExceptionFilter,
    HttpException,
    PayloadTooLargeException,
} from '@nestjs/common'
import type { FileFieldsInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { MAX_IMAGE_DIMENSIONS_TEXT } from '../storage/image-size.js'
import { ALLOWED_IMAGE_MIME_TYPES } from '../storage/image-type.js'
import { MAX_IMAGE_LAYERS } from './design-layers.js'

export const ORIGINALS_FIELD = 'originals'
export const ARTWORK_FIELD = 'artwork'
export const PREVIEW_FIELD = 'preview'
export const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024
/** Cloudinary's free plan stores files of at most 10 MB. */
export const MAX_ARTWORK_BYTES = 10 * 1024 * 1024
export const MAX_PREVIEW_BYTES = 2 * 1024 * 1024

export const INVALID_ORIGINAL_TYPE = 'Tu imagen debe ser JPG, PNG o WEBP.'
export const INVALID_PREVIEW_TYPE = 'La vista previa del diseño debe ser una imagen PNG.'
export const INVALID_ARTWORK_TYPE = 'El arte final del diseño debe ser una imagen PNG.'
export const ORIGINAL_TOO_LARGE = `Tu imagen puede pesar como máximo ${MAX_ORIGINAL_BYTES / (1024 * 1024)} MB.`
export const ORIGINAL_TOO_MANY_PIXELS = `Tu imagen es demasiado grande: puede medir como máximo ${MAX_IMAGE_DIMENSIONS_TEXT}.`

export const DESIGN_UPLOAD_FIELDS = [
    { name: ORIGINALS_FIELD, maxCount: MAX_IMAGE_LAYERS },
    { name: ARTWORK_FIELD, maxCount: 1 },
    { name: PREVIEW_FIELD, maxCount: 1 },
]

function typeError(field: string, message: string): BadRequestException {
    return new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message,
        details: [{ field, errors: [message] }],
    })
}

/**
 * Multer options: up to 5 originals, the arte final and the preview, at most 10 MB each (the
 * preview's 2 MB is checked by the service),
 * and the few text fields of CreateDesignDto (`layers` is a JSON of up to 8 layers).
 */
export const DESIGN_UPLOAD_OPTIONS: NonNullable<Parameters<typeof FileFieldsInterceptor>[1]> = {
    limits: {
        fileSize: Math.max(MAX_ORIGINAL_BYTES, MAX_ARTWORK_BYTES),
        files: MAX_IMAGE_LAYERS + 2,
        fields: 8,
        fieldSize: 16_000,
    },
    fileFilter: (_req, file, callback) => {
        if (file.fieldname === PREVIEW_FIELD && file.mimetype !== 'image/png') {
            callback(typeError(PREVIEW_FIELD, INVALID_PREVIEW_TYPE), false)
            return
        }
        if (file.fieldname === ARTWORK_FIELD && file.mimetype !== 'image/png') {
            callback(typeError(ARTWORK_FIELD, INVALID_ARTWORK_TYPE), false)
            return
        }
        if (!ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
            callback(typeError(ORIGINALS_FIELD, INVALID_ORIGINAL_TYPE), false)
            return
        }
        callback(null, true)
    },
}

const MULTER_MESSAGES: Record<string, string> = {
    'File too large': `Cada archivo de tu diseño puede pesar como máximo ${MAX_ARTWORK_BYTES / (1024 * 1024)} MB.`,
    'Too many files': `Puedes usar hasta ${MAX_IMAGE_LAYERS} imágenes por diseño.`,
    'Unexpected field': `Envía tus imágenes en el campo "${ORIGINALS_FIELD}", el arte final en "${ARTWORK_FIELD}" y la vista previa en "${PREVIEW_FIELD}".`,
    'Multipart: Boundary not found': 'La solicitud debe enviarse como multipart/form-data.',
}

/**
 * Multer reports a 6th original (over `maxCount`) like an unknown field:
 * "Unexpected file field - originals".
 */
function translateMulter(message: string): string | undefined {
    if (message === `Unexpected file field - ${ORIGINALS_FIELD}`) {
        return MULTER_MESSAGES['Too many files']
    }
    if (message.startsWith('Unexpected file field')) return MULTER_MESSAGES['Unexpected field']
    return MULTER_MESSAGES[message]
}

/** Translates Multer's English limit errors, keeping the usual `{ message, details }` body. */
@Catch(PayloadTooLargeException, BadRequestException)
export class DesignUploadErrorsFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>()
        const status = exception.getStatus()
        const translated = translateMulter(exception.message)
        response.status(status).json(
            translated
                ? {
                      statusCode: status,
                      error: exception.name,
                      message: translated,
                      details: [{ field: ORIGINALS_FIELD, errors: [translated] }],
                  }
                : exception.getResponse(),
        )
    }
}
