import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { TypeOrmModule } from '@nestjs/typeorm'
import type { Env } from '../config/env.schema.js'
import { createDataSourceOptions } from './database.options.js'

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => ({
                ...createDataSourceOptions(config.get('DATABASE_URL', { infer: true })),
                retryAttempts: 5,
                retryDelay: 3000,
            }),
        }),
    ],
})
export class DatabaseModule {}
