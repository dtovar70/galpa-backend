import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common'
import { SYSTEM_CONSTRAINT_MESSAGES } from '../validation/messages.js'

interface FieldError {
    field: string
    errors: string[]
}

/** class-validator's own English wording (a `message` given in a DTO never matches). */
const DEFAULT_MESSAGE_PATTERN = /should not exist|nested property|unknown value/

/**
 * DTO decorators carry their own Spanish messages; the constraints class-validator adds on its
 * own (unknown properties, malformed nested objects) are translated here.
 */
function translateConstraints(error: ValidationError): string[] {
    return Object.entries(error.constraints ?? {}).map(([constraint, message]) => {
        const translate = SYSTEM_CONSTRAINT_MESSAGES[constraint]
        return translate && DEFAULT_MESSAGE_PATTERN.test(message)
            ? translate(error.property)
            : message
    })
}

function flattenErrors(errors: ValidationError[], parent = ''): FieldError[] {
    return errors.flatMap((error) => {
        const field = parent ? `${parent}.${error.property}` : error.property
        const messages = translateConstraints(error)
        const own: FieldError[] = messages.length ? [{ field, errors: messages }] : []
        return [...own, ...flattenErrors(error.children ?? [], field)]
    })
}

/**
 * Global pipe: strips/rejects unknown properties and transforms payloads into DTO instances.
 * The top-level message is Spanish (shown to users); `details` keeps the per-field messages,
 * also in Spanish.
 */
export function createValidationPipe(): ValidationPipe {
    return new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: (errors) =>
            new BadRequestException({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Los datos enviados no son válidos. Revisa los campos marcados.',
                details: flattenErrors(errors),
            }),
    })
}
