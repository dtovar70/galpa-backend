import type { RateSource } from './providers/rate-provider.js'

/**
 * Rate-sync health events. Listeners (the Telegram bot) subscribe with `@OnEvent(...)`, so the
 * exchange-rate module never depends on who is told.
 */
export const EXCHANGE_RATE_EVENTS = {
    /** Emitted once when the automatic sync has failed several times in a row. */
    syncFailing: 'exchange_rate.sync_failing',
    /** Emitted once when a sync succeeds again after `syncFailing`. */
    syncRecovered: 'exchange_rate.sync_recovered',
} as const

/** The rate checkout is using, as the events carry it. */
export interface RateSnapshot {
    rate: number
    source: RateSource
    effectiveDate: string
    /** ISO instant after which orders pause unless a newer rate arrives. */
    usableUntil: string
    isStale: boolean
}

export interface RateSyncFailingEvent {
    consecutiveFailures: number
    /** One entry per provider tried in the last run, e.g. `{ source: 'bcv', error: '…' }`. */
    errors: { source: Exclude<RateSource, 'manual'>; error: string }[]
    /** Null when no rate was ever stored. */
    current: RateSnapshot | null
    at: string
}

export interface RateSyncRecoveredEvent {
    outcome: 'stored' | 'unchanged'
    /** Failed runs before this success. */
    failedRuns: number
    current: RateSnapshot | null
    at: string
}
