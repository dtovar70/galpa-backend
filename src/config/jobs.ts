import type { ConfigService } from '@nestjs/config'
import type { Env } from './env.schema.js'

/** Background jobs run unless disabled, and never under NODE_ENV=test unless forced on. */
export function scheduledJobsEnabled(config: ConfigService<Env, true>): boolean {
    const explicit = config.get('SCHEDULED_JOBS_ENABLED', { infer: true })
    return explicit ?? config.get('NODE_ENV', { infer: true }) !== 'test'
}
