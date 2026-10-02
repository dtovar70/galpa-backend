import { applyDecorators } from '@nestjs/common'
import { Transform, type TransformFnParams } from 'class-transformer'
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsNotEmpty,
    IsNumber,
    IsString,
    Max,
    MaxLength,
    Min,
    registerDecorator,
    type ValidationArguments,
} from 'class-validator'
import { msg, type FieldName } from '../../common/validation/messages.js'
import { CONTENT_PLACEHOLDERS, type ContentPlaceholder } from '../content.types.js'

/** `{word}` tokens; anything in braces counts, so typos like `{envio gratis}` are caught. */
const PLACEHOLDER_PATTERN = /\{([^{}]*)\}/g

/** Upper bound for the money fields (USD). */
export const CONTENT_MAX_MONEY = 100_000

export interface TextRules {
    max: number
    /** Allows an empty string. The field itself must still be sent (sections are replaced whole). */
    optional?: boolean
    /** Placeholders the field accepts; any other `{…}` is rejected. */
    placeholders?: readonly ContentPlaceholder[]
    /** The field supports *highlighted* words, so its asterisks must come in pairs. */
    highlights?: boolean
}

function placeholderList(names: readonly ContentPlaceholder[]): string {
    return names.map((name) => CONTENT_PLACEHOLDERS[name]).join(', ')
}

/** First placeholder in `text` that is not allowed, e.g. "{envio}". */
export function findUnknownPlaceholder(
    text: string,
    allowed: readonly ContentPlaceholder[] = [],
): string | undefined {
    for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
        if (!(allowed as readonly string[]).includes(match[1] ?? '')) return match[0]
    }
    return undefined
}

/** An odd number of asterisks leaves a highlight open; `**` is an empty highlight. */
export function hasBrokenHighlights(text: string): boolean {
    // Odd-numbered parts sit between a pair of asterisks.
    const parts = text.split('*')
    if (parts.length % 2 === 0) return true
    return parts.some((part, index) => index % 2 === 1 && part.trim() === '')
}

/** Problems with placeholders and highlight marks, or null. */
export function markupProblem(text: string, field: FieldName, rules: TextRules): string | null {
    const unknown = findUnknownPlaceholder(text, rules.placeholders)
    if (unknown) {
        return rules.placeholders?.length
            ? `${field.name} usa ${unknown}, que no existe. Puedes usar ${placeholderList(rules.placeholders)}.`
            : `${field.name} no admite marcadores como ${unknown}.`
    }
    if (rules.highlights && hasBrokenHighlights(text)) {
        return `${field.name} tiene un destacado sin cerrar o vacío. Marca las palabras destacadas así: *palabras*.`
    }
    return null
}

/** Every rule of a text field, for list items (which class-validator cannot name one by one). */
export function textProblem(value: unknown, field: FieldName, rules: TextRules): string | null {
    if (typeof value !== 'string') return msg.text(field)
    if (!rules.optional && value === '') return msg.required(field)
    if (value.length > rules.max) return msg.maxLength(field, rules.max)
    return markupProblem(value, field, rules)
}

function trimText({ value }: TransformFnParams): unknown {
    return typeof value === 'string' ? value.trim() : value
}

function trimTextList({ value }: TransformFnParams): unknown {
    return Array.isArray(value)
        ? value.map((item: unknown) => (typeof item === 'string' ? item.trim() : item))
        : value
}

function ContentMarkup(field: FieldName, rules: TextRules): PropertyDecorator {
    return (target, propertyName) => {
        registerDecorator({
            name: 'contentMarkup',
            target: target.constructor,
            propertyName: String(propertyName),
            validator: {
                validate: (value: unknown) =>
                    typeof value !== 'string' || markupProblem(value, field, rules) === null,
                defaultMessage: (args?: ValidationArguments) =>
                    typeof args?.value === 'string'
                        ? (markupProblem(args.value, field, rules) ?? '')
                        : '',
            },
        })
    }
}

/** A trimmed text field: type, required (unless optional), length, placeholders, highlights. */
export function ContentText(field: FieldName, rules: TextRules): PropertyDecorator {
    return applyDecorators(
        Transform(trimText),
        IsString({ message: msg.text(field) }),
        ...(rules.optional ? [] : [IsNotEmpty({ message: msg.required(field) })]),
        MaxLength(rules.max, { message: msg.maxLength(field, rules.max) }),
        ContentMarkup(field, rules),
    )
}

export interface TextListRules extends TextRules {
    minItems: number
    maxItems: number
    /** Names one item for its messages: (2) -> "El párrafo 2". */
    item: (position: number) => FieldName
}

function firstItemProblem(value: unknown, rules: TextListRules): string | null {
    if (!Array.isArray(value)) return null
    for (const [index, item] of value.entries()) {
        const problem = textProblem(item, rules.item(index + 1), rules)
        if (problem) return problem
    }
    return null
}

/**
 * A list of trimmed texts. Item errors are reported on the list and name the position
 * ("El anuncio 2 es obligatorio."), since the API reports list items as one field.
 */
export function ContentTextList(field: FieldName, rules: TextListRules): PropertyDecorator {
    const items: PropertyDecorator = (target, propertyName) => {
        registerDecorator({
            name: 'contentTextItems',
            target: target.constructor,
            propertyName: String(propertyName),
            validator: {
                validate: (value: unknown) => firstItemProblem(value, rules) === null,
                defaultMessage: (args?: ValidationArguments) =>
                    firstItemProblem(args?.value, rules) ?? '',
            },
        })
    }
    return applyDecorators(
        Transform(trimTextList),
        IsArray({ message: msg.list(field) }),
        ArrayMinSize(rules.minItems, { message: msg.listMinSize(field, rules.minItems) }),
        ArrayMaxSize(rules.maxItems, { message: msg.listMaxSize(field, rules.maxItems) }),
        items,
    )
}

/** A list of nested objects (validated by their own DTO, see `@ValidateNested`). */
export function ContentList(
    field: FieldName,
    rules: { minItems: number; maxItems: number },
): PropertyDecorator {
    return applyDecorators(
        IsArray({ message: msg.list(field) }),
        ArrayMinSize(rules.minItems, { message: msg.listMinSize(field, rules.minItems) }),
        ArrayMaxSize(rules.maxItems, { message: msg.listMaxSize(field, rules.maxItems) }),
    )
}

/** USD amount: >= 0, up to 2 decimals. */
export function ContentMoney(field: FieldName): PropertyDecorator {
    return applyDecorators(
        IsNumber(
            { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
            { message: msg.money(field) },
        ),
        Min(0, { message: msg.notNegative(field) }),
        Max(CONTENT_MAX_MONEY, { message: msg.max(field, CONTENT_MAX_MONEY) }),
    )
}
