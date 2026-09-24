import type { DataSourceOptions } from 'typeorm'
import { ENTITIES } from './entities.js'

/**
 * Options shared by the Nest app and the CLI DataSource.
 * `synchronize` must stay false: the schema only changes through reviewed migrations.
 */
export function createDataSourceOptions(url: string): DataSourceOptions {
    return {
        type: 'postgres',
        url,
        entities: ENTITIES,
        synchronize: false,
        migrationsRun: false,
        migrationsTableName: 'typeorm_migrations',
    }
}
