/** A rate as a provider reports it, before it is stored. */
export interface FetchedRate {
    /** Bolívares per US dollar. */
    rate: number
    /** BCV "fecha valor": the day the rate applies to, "YYYY-MM-DD" (Caracas). */
    effectiveDate: string
}

export type RateSource = 'bcv' | 'dolarapi' | 'manual'

/** One place a BCV rate can be read from. Providers are tried in order until one answers. */
export interface ExchangeRateProvider {
    readonly source: Exclude<RateSource, 'manual'>
    fetchRate(): Promise<FetchedRate>
}

export const EXCHANGE_RATE_PROVIDERS = Symbol('EXCHANGE_RATE_PROVIDERS')

/** Human name of each source, for the admin. */
export const RATE_SOURCE_LABELS: Record<RateSource, string> = {
    bcv: 'BCV (bcv.org.ve)',
    dolarapi: 'DolarApi (dólar oficial BCV)',
    manual: 'Manual',
}

/** Sanity bounds: anything outside is a parsing error, not a rate. */
export const MIN_PLAUSIBLE_RATE = 0.0001
export const MAX_PLAUSIBLE_RATE = 100_000_000

/** Rounds to the 4 decimals the rates are stored with. */
export function roundRate(rate: number): number {
    return Math.round(rate * 10_000) / 10_000
}

export function assertPlausibleRate(rate: number, source: string): number {
    if (!Number.isFinite(rate) || rate < MIN_PLAUSIBLE_RATE || rate > MAX_PLAUSIBLE_RATE) {
        throw new Error(`${source}: implausible rate ${String(rate)}`)
    }
    return roundRate(rate)
}
