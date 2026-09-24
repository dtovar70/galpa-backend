import { QueryFailedError } from 'typeorm'

/** Postgres error codes: 23505 = unique violation, 23503 = foreign key violation. */
export type PgErrorCode = '23505' | '23503'

export function isDbError(error: unknown, code: PgErrorCode): boolean {
    if (!(error instanceof QueryFailedError)) return false
    const driverError = error.driverError as { code?: unknown } | undefined
    return driverError?.code === code
}

/** Returns a copy without `undefined` values, so partial updates only touch sent fields. */
export function omitUndefined<T extends object>(value: T): Partial<T> {
    return Object.fromEntries(
        Object.entries(value).filter(([, entry]) => entry !== undefined),
    ) as Partial<T>
}
