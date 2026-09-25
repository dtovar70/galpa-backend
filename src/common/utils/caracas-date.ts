/**
 * Venezuela runs on UTC-4 all year (no daylight saving). Business dates (the BCV "fecha valor",
 * payment dates, admin date filters) are calendar days in that zone.
 */
export const CARACAS_TIME_ZONE = 'America/Caracas'
export const CARACAS_UTC_OFFSET = '-04:00'

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

const dayFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CARACAS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
})

/** Calendar day of `date` in Caracas, "YYYY-MM-DD". */
export function caracasDay(date: Date = new Date()): string {
    return dayFormatter.format(date)
}

export function isDateOnly(value: string): boolean {
    if (!DATE_ONLY.test(value)) return false
    const parsed = new Date(`${value}T00:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value)
}

/** Midnight at the start of a Caracas calendar day, as an instant. */
export function startOfCaracasDay(day: string): Date {
    return new Date(`${day}T00:00:00${CARACAS_UTC_OFFSET}`)
}

/** "2026-09-24" + n days (n may be negative). */
export function addDays(day: string, days: number): string {
    const date = new Date(`${day}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
}
