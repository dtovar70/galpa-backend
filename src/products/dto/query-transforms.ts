import type { TransformFnParams } from 'class-transformer'

/** Accepts `?tags=a,b`, `?tags=a&tags=b` or a mix of both. */
export function toStringArray({ value }: TransformFnParams): unknown {
    if (value === undefined || value === null || value === '') return undefined
    const values: unknown[] = Array.isArray(value) ? value : [value]
    return values
        .flatMap((item) => (typeof item === 'string' ? item.split(',') : [item]))
        .map((item) => (typeof item === 'string' ? item.trim() : item))
        .filter((item) => item !== '')
}

export function toTrimmedString({ value }: TransformFnParams): unknown {
    return typeof value === 'string' ? value.trim() || undefined : value
}

export function toBoolean({ value }: TransformFnParams): unknown {
    if (value === 'true' || value === true) return true
    if (value === 'false' || value === false) return false
    return value
}
