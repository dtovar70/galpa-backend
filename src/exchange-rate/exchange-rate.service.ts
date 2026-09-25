import {
    BadRequestException,
    Inject,
    Injectable,
    Logger,
    ServiceUnavailableException,
    type OnApplicationBootstrap,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { AuthUser } from '../common/types/auth-user.js'
import { addDays, caracasDay, isDateOnly, startOfCaracasDay } from '../common/utils/caracas-date.js'
import type { Env } from '../config/env.schema.js'
import { scheduledJobsEnabled } from '../config/jobs.js'
import { newId } from '../database/id.js'
import { ExchangeRate } from './entities/exchange-rate.entity.js'
import {
    EXCHANGE_RATE_PROVIDERS,
    RATE_SOURCE_LABELS,
    roundRate,
    type ExchangeRateProvider,
    type RateSource,
} from './providers/rate-provider.js'

const HOUR_MS = 3_600_000
const HISTORY_LIMIT = 30
/** A manual rate may be dated ahead (the BCV publishes the next business day's rate). */
const MANUAL_MAX_DAYS_AHEAD = 7
const SYNC_INTERVAL_NAME = 'exchange-rate-sync'

export const EXCHANGE_RATE_UNAVAILABLE = 'EXCHANGE_RATE_UNAVAILABLE'
export const EXCHANGE_RATE_UNAVAILABLE_MESSAGE =
    'No pudimos obtener la tasa del BCV. Intenta más tarde o contáctanos por WhatsApp.'

/** A stored rate as the API returns it. */
export interface ExchangeRateDto {
    id: string
    rate: number
    source: RateSource
    sourceLabel: string
    effectiveDate: string
    fetchedAt: string
    isManual: boolean
    createdBy: { id: string; name: string } | null
}

/** The rate checkout would use right now, with its freshness. */
export interface CurrentRateDto extends ExchangeRateDto {
    /** After this instant the rate is too old for checkout (fecha valor + max age). */
    usableUntil: string
    isStale: boolean
}

/** `GET /exchange-rate/current`. */
export type PublicCurrentRateDto =
    | ({ available: true } & Omit<CurrentRateDto, 'createdBy' | 'id'>)
    | { available: false; reason: 'missing' | 'stale'; message: string }

export interface SyncAttempt {
    source: Exclude<RateSource, 'manual'>
    ok: boolean
    rate?: number
    effectiveDate?: string
    error?: string
}

export interface SyncResult {
    at: string
    /** Stored = a new row was added; unchanged = same as the last automatic rate. */
    outcome: 'stored' | 'unchanged' | 'failed'
    attempts: SyncAttempt[]
}

export interface AdminExchangeRateDto {
    current: CurrentRateDto | null
    history: ExchangeRateDto[]
    lastSync: SyncResult | null
    maxAgeHours: number
    syncIntervalMinutes: number
}

function toDto(row: ExchangeRate): ExchangeRateDto {
    return {
        id: row.id,
        rate: row.rate,
        source: row.source,
        sourceLabel: RATE_SOURCE_LABELS[row.source],
        effectiveDate: row.effectiveDate,
        fetchedAt: row.fetchedAt.toISOString(),
        isManual: row.isManual,
        createdBy: row.createdBy ? { id: row.createdBy.id, name: row.createdBy.name } : null,
    }
}

/** Last instant a rate with this fecha valor may be used: its day's start + max age. */
export function rateUsableUntil(effectiveDate: string, maxAgeHours: number): Date {
    return new Date(startOfCaracasDay(effectiveDate).getTime() + maxAgeHours * HOUR_MS)
}

export function isRateStale(effectiveDate: string, maxAgeHours: number, now = new Date()): boolean {
    return now.getTime() > rateUsableUntil(effectiveDate, maxAgeHours).getTime()
}

/**
 * The BCV bolívar/dollar rate. Providers are tried in order (the BCV website first, then a
 * public JSON mirror); a new row is stored only when the rate or its fecha valor changed, so a
 * manual rate stays in force until the BCV publishes a different one.
 */
@Injectable()
export class ExchangeRateService implements OnApplicationBootstrap {
    private readonly logger = new Logger(ExchangeRateService.name)
    private readonly maxAgeHours: number
    private readonly syncIntervalMinutes: number
    private running: Promise<SyncResult> | null = null
    private lastSync: SyncResult | null = null

    constructor(
        @InjectRepository(ExchangeRate) private readonly rates: Repository<ExchangeRate>,
        @Inject(EXCHANGE_RATE_PROVIDERS) private readonly providers: ExchangeRateProvider[],
        private readonly config: ConfigService<Env, true>,
        private readonly scheduler: SchedulerRegistry,
    ) {
        this.maxAgeHours = config.get('EXCHANGE_RATE_MAX_AGE_HOURS', { infer: true })
        this.syncIntervalMinutes = config.get('EXCHANGE_RATE_SYNC_INTERVAL_MINUTES', {
            infer: true,
        })
    }

    onApplicationBootstrap(): void {
        if (!scheduledJobsEnabled(this.config)) return
        // Not awaited: startup must not wait for (or fail because of) a slow BCV website.
        void this.sync()
        const interval = setInterval(() => void this.sync(), this.syncIntervalMinutes * 60_000)
        this.scheduler.addInterval(SYNC_INTERVAL_NAME, interval)
    }

    /** Newest stored rate, fresh or not. */
    async latest(): Promise<ExchangeRate | null> {
        return this.rates.findOne({
            where: {},
            order: { fetchedAt: 'DESC', id: 'DESC' },
            relations: { createdBy: true },
        })
    }

    async current(): Promise<CurrentRateDto | null> {
        const row = await this.latest()
        return row ? this.withFreshness(row) : null
    }

    async publicCurrent(): Promise<PublicCurrentRateDto> {
        const current = await this.current()
        if (!current) {
            return {
                available: false,
                reason: 'missing',
                message: EXCHANGE_RATE_UNAVAILABLE_MESSAGE,
            }
        }
        if (current.isStale) {
            return { available: false, reason: 'stale', message: EXCHANGE_RATE_UNAVAILABLE_MESSAGE }
        }
        const { id: _id, createdBy: _createdBy, ...rest } = current
        return { available: true, ...rest }
    }

    /** The rate for a new order; 503 in Spanish when there is none or it is too old. */
    async requireUsableRate(): Promise<ExchangeRate> {
        const row = await this.latest()
        if (!row || isRateStale(row.effectiveDate, this.maxAgeHours)) {
            throw new ServiceUnavailableException({
                statusCode: 503,
                error: 'Service Unavailable',
                code: EXCHANGE_RATE_UNAVAILABLE,
                message: EXCHANGE_RATE_UNAVAILABLE_MESSAGE,
            })
        }
        return row
    }

    async adminView(): Promise<AdminExchangeRateDto> {
        const history = await this.rates.find({
            order: { fetchedAt: 'DESC', id: 'DESC' },
            take: HISTORY_LIMIT,
            relations: { createdBy: true },
        })
        const newest = history[0]
        return {
            current: newest ? this.withFreshness(newest) : null,
            history: history.map(toDto),
            lastSync: this.lastSync,
            maxAgeHours: this.maxAgeHours,
            syncIntervalMinutes: this.syncIntervalMinutes,
        }
    }

    /** Asks the providers for the rate and stores it when it changed. Never throws. */
    sync(): Promise<SyncResult> {
        // Concurrent callers (cron + "Actualizar ahora") share one run.
        this.running ??= this.runSync().finally(() => {
            this.running = null
        })
        return this.running
    }

    async setManual(rate: number, effectiveDate: string | undefined, user: AuthUser) {
        const today = caracasDay()
        const day = effectiveDate ?? today
        if (!isDateOnly(day)) {
            throw new BadRequestException({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Los datos enviados no son válidos. Revisa los campos marcados.',
                details: [{ field: 'effectiveDate', errors: ['La fecha valor no es válida.'] }],
            })
        }
        if (day > addDays(today, MANUAL_MAX_DAYS_AHEAD)) {
            throw new BadRequestException({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Los datos enviados no son válidos. Revisa los campos marcados.',
                details: [
                    {
                        field: 'effectiveDate',
                        errors: [
                            `La fecha valor no puede estar a más de ${MANUAL_MAX_DAYS_AHEAD} días en el futuro.`,
                        ],
                    },
                ],
            })
        }
        await this.rates.insert({
            id: newId(),
            rate: roundRate(rate),
            source: 'manual',
            effectiveDate: day,
            fetchedAt: new Date(),
            isManual: true,
            createdById: user.id,
        })
        this.logger.log(`Manual rate ${rate} (${day}) set by ${user.email}`)
        return this.adminView()
    }

    private withFreshness(row: ExchangeRate): CurrentRateDto {
        return {
            ...toDto(row),
            usableUntil: rateUsableUntil(row.effectiveDate, this.maxAgeHours).toISOString(),
            isStale: isRateStale(row.effectiveDate, this.maxAgeHours),
        }
    }

    private async runSync(): Promise<SyncResult> {
        const attempts: SyncAttempt[] = []
        let outcome: SyncResult['outcome'] = 'failed'

        for (const provider of this.providers) {
            try {
                const fetched = await provider.fetchRate()
                attempts.push({ source: provider.source, ok: true, ...fetched })
                const lastAutomatic = await this.rates.findOne({
                    where: { isManual: false },
                    order: { fetchedAt: 'DESC', id: 'DESC' },
                })
                const changed =
                    !lastAutomatic ||
                    lastAutomatic.rate !== fetched.rate ||
                    lastAutomatic.effectiveDate !== fetched.effectiveDate
                if (changed) {
                    await this.rates.insert({
                        id: newId(),
                        rate: fetched.rate,
                        source: provider.source,
                        effectiveDate: fetched.effectiveDate,
                        fetchedAt: new Date(),
                        isManual: false,
                        createdById: null,
                    })
                    this.logger.log(
                        `Stored BCV rate ${fetched.rate} (${fetched.effectiveDate}) from ${provider.source}`,
                    )
                }
                outcome = changed ? 'stored' : 'unchanged'
                break
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                attempts.push({ source: provider.source, ok: false, error: message })
                this.logger.warn(`Rate provider ${provider.source} failed: ${message}`)
            }
        }

        if (outcome === 'failed') this.logger.error('No exchange-rate provider answered')
        this.lastSync = { at: new Date().toISOString(), outcome, attempts }
        return this.lastSync
    }
}
