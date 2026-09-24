import {
    ArgumentsHost,
    BadRequestException,
    Catch,
    ExceptionFilter,
    HttpException,
    PayloadTooLargeException,
} from '@nestjs/common'
import type { Response } from 'express'
import { MAX_IMAGES_PER_UPLOAD, MAX_IMAGE_SIZE_BYTES } from './products.constants.js'

const MAX_MB = MAX_IMAGE_SIZE_BYTES / (1024 * 1024)

/** Multer (via Nest) reports limits in English; translate them for the admin UI. */
const MULTER_MESSAGES: Record<string, string> = {
    'File too large': `Cada imagen puede pesar como máximo ${MAX_MB} MB.`,
    'Too many files': `Puedes subir hasta ${MAX_IMAGES_PER_UPLOAD} imágenes a la vez.`,
    'Unexpected field': `Envía hasta ${MAX_IMAGES_PER_UPLOAD} imágenes en el campo "files".`,
    'Multipart: Boundary not found': 'La solicitud debe enviarse como multipart/form-data.',
}

@Catch(PayloadTooLargeException, BadRequestException)
export class UploadErrorsFilter implements ExceptionFilter {
    catch(exception: HttpException, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>()
        const status = exception.getStatus()
        const translated = MULTER_MESSAGES[exception.message]

        response
            .status(status)
            .json(
                translated
                    ? { statusCode: status, error: exception.name, message: translated }
                    : exception.getResponse(),
            )
    }
}
