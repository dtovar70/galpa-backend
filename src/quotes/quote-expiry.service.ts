import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import type { Env } from '../config/env.schema.js'
import { scheduledJobsEnabled } from '../config/jobs.js'
import { QuotesService } from './quotes.service.js'

const QUOTE_EXPIRY_INTERVAL_NAME = 'quotes-expiry'
/** Quotes expire by calendar day, so an hourly check is plenty. */
const QUOTE_EXPIRY_INTERVAL_MS = 60 * 60_000

/**
 * Sent quotes (ENVIADA) whose validity day passed become VENCIDA. Runs hourly (and once at
 * startup) unless scheduled jobs are off (SCHEDULED_JOBS_ENABLED, never under NODE_ENV=test).
 */
@Injectable()
export class QuoteExpiryService implements OnApplicationBootstrap {
    private readonly logger = new Logger(QuoteExpiryService.name)
    private running = false

    constructor(
        private readonly quotes: QuotesService,
        private readonly config: ConfigService<Env, true>,
        private readonly scheduler: SchedulerRegistry,
    ) {}

    onApplicationBootstrap(): void {
        if (!scheduledJobsEnabled(this.config)) return
        void this.runSafely()
        this.scheduler.addInterval(
            QUOTE_EXPIRY_INTERVAL_NAME,
            setInterval(() => void this.runSafely(), QUOTE_EXPIRY_INTERVAL_MS),
        )
    }

    private async runSafely(): Promise<void> {
        if (this.running) return
        this.running = true
        try {
            await this.quotes.expireOverdue()
        } catch (error) {
            this.logger.error('Quote expiry failed', error as Error)
        } finally {
            this.running = false
        }
    }
}
