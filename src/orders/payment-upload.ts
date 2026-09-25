import {
    ArgumentsHost,
    BadRequestException,
    Catch,
    type ExceptionFilter,
    HttpException,
    PayloadTooLargeException,
} from '@nestjs/common'
import type { Response } from 'express'
import type { FileInterceptor } from '@nestjs/platform-express'
import { ALLOWED_IMAGE_MIME_TYPES } from '../storage/image-type.js'

export const PROOF_FIELD = 'proof'
export const MAX_PROOF_SIZE_BYTES = 5 * 1024 * 1024
const MAX_MB = MAX_PROOF_SIZE_BYTES / (1024 * 1024)
export const INVALID_PROOF_TYPE = 'La captura debe ser una imagen JPG, PNG o WEBP.'

/** Multer options for the payment screenshot: one image, 5 MB, only a few text fields. */
export const PROOF_UPLOAD_OPTIONS: NonNullable<Parameters<typeof FileInterceptor>[1]> = {
    limits: { fileSize: MAX_PROOF_SIZE_BYTES, files: 1, fields: 12, fieldSize: 10_000 },
    fileFilter: (_req, file, callback) => {
        if (ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)) {
            callback(null, true)
            return
        }
        callback(
            new BadRequestException({
                statusCode: 400,
                error: 'Bad Request',
                message: INVALID_PROOF_TYPE,
                details: [{ field: PROOF_FIELD, errors: [INVALID_PROOF_TYPE] }],
            }),
            false,
        )
    },
}

const MULTER_MESSAGES: Record<string, string> = {
    'File too large': `La captura puede pesar como máximo ${MAX_MB} MB.`,
    'Too many files': 'Adjunta una sola captura.',
    'Unexpected field': `Adjunta la captura en el campo "${PROOF_FIELD}".`,
    'Multipart: Boundary not found': 'La solicitud debe enviarse como multipart/form-data.',
}

/** Translates Multer's English limit errors, keeping the usual `{ message, details }` body. */
@Catch(PayloadTooLargeException, BadRequestException)
export class ProofUploadErrorsFilter implements ExceptionFilter {
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
                      details: [{ field: PROOF_FIELD, errors: [translated] }],
                  }
                : exception.getResponse(),
        )
    }
}
