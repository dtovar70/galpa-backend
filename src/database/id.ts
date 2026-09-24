import { randomUUID } from 'node:crypto'

/** Primary keys are text columns; new rows get a random UUID (seeded rows keep their ids). */
export function newId(): string {
    return randomUUID()
}
