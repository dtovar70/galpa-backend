import { MaxLength } from 'class-validator'
import { msg, type FieldName } from './messages.js'

/**
 * Longest value of any single-line text field (text, email, search, tel inputs). The storefront
 * and admin inputs stop at the same length, and the columns behind them are `varchar(100)`.
 * Multi-line fields (textareas) keep their own, larger limits.
 */
export const TEXT_INPUT_MAX_LENGTH = 100

/** `@MaxLength(TEXT_INPUT_MAX_LENGTH)` with the usual Spanish message. */
export function MaxInputLength(field: FieldName): PropertyDecorator {
    return MaxLength(TEXT_INPUT_MAX_LENGTH, {
        message: msg.maxLength(field, TEXT_INPUT_MAX_LENGTH),
    })
}
