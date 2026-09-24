import type { ValueTransformer } from 'typeorm'

/**
 * `numeric` columns come back from `pg` as strings (to avoid precision loss). Money values
 * here are small (numeric(10,2)), so exposing them as JS numbers is safe.
 */
export const decimalTransformer: ValueTransformer = {
    to: (value: number | null | undefined) => value,
    from: (value: string | null) => (value === null ? null : Number(value)),
}
