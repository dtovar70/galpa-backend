import { Transform, type TransformFnParams } from 'class-transformer'

/** Trims strings before validation, so "  " counts as empty. Other values pass through. */
export function Trim(): PropertyDecorator {
    return Transform(({ value }: TransformFnParams): unknown =>
        typeof value === 'string' ? value.trim() : value,
    )
}
