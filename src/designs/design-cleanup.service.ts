import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SchedulerRegistry } from '@nestjs/schedule'
import type { Env } from '../config/env.schema.js'
import { scheduledJobsEnabled } from '../config/jobs.js'
import { DesignsService } from './designs.service.js'

const CLEANUP_INTERVAL_NAME = 'designs-cleanup'
/** Every 6 hours (and once at startup): designs only expire after 7 days. */
export const DESIGN_CLEANUP_INTERVAL_MS = 6 * 60 * 60_000

/**
 * Deletes the designs uploaded but never ordered (older than 7 days), files included. Gated by
 * SCHEDULED_JOBS_ENABLED like the other background jobs.
 */
@Injectable()
export class DesignCleanupService implements OnApplicationBootstrap {
    private readonly logger = new Logger(DesignCleanupService.name)
    private running = false

    constructor(
        private readonly designs: DesignsService,
        private readonly config: ConfigService<Env, true>,
        private readonly scheduler: SchedulerRegistry,
    ) {}

    onApplicationBootstrap(): void {
        if (!scheduledJobsEnabled(this.config)) return
        void this.runSafely()
        this.scheduler.addInterval(
            CLEANUP_INTERVAL_NAME,
            setInterval(() => void this.runSafely(), DESIGN_CLEANUP_INTERVAL_MS),
        )
    }

    async runSafely(): Promise<void> {
        if (this.running) return
        this.running = true
        try {
            await this.designs.deleteStale()
        } catch (error) {
            this.logger.error('Design cleanup failed', error as Error)
        } finally {
            this.running = false
        }
    }
}
