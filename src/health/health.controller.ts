import { Controller, Get, Header, Logger, ServiceUnavailableException } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { SkipThrottle } from '@nestjs/throttler'
import { DataSource } from 'typeorm'
import { Public } from '../common/decorators/public.decorator.js'

/** A health probe must answer fast even when the database hangs. */
export const HEALTH_DB_TIMEOUT_MS = 2_000

export interface HealthDto {
    status: 'ok'
    database: 'up'
}

/**
 * Liveness + readiness for the proxy and the uptime monitor: one `SELECT 1` with a short
 * timeout. 503 when the database is unreachable. Unthrottled (monitors poll it) and cheap.
 */
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
    private readonly logger = new Logger(HealthController.name)

    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    @Get()
    @Header('Cache-Control', 'no-store')
    async check(): Promise<HealthDto> {
        try {
            await this.pingDatabase()
        } catch (error) {
            this.logger.warn(
                `Database health check failed: ${error instanceof Error ? error.message : String(error)}`,
            )
            throw new ServiceUnavailableException({
                statusCode: 503,
                error: 'Service Unavailable',
                status: 'error',
                database: 'down',
                message: 'El servicio no está disponible en este momento.',
            })
        }
        return { status: 'ok', database: 'up' }
    }

    private async pingDatabase(): Promise<void> {
        let timer: NodeJS.Timeout | undefined
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`SELECT 1 took more than ${HEALTH_DB_TIMEOUT_MS} ms`)),
                HEALTH_DB_TIMEOUT_MS,
            )
        })
        try {
            await Promise.race([this.dataSource.query('SELECT 1'), timeout])
        } finally {
            clearTimeout(timer)
        }
    }
}
