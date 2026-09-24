/**
 * DataSource used by the TypeORM CLI (migrations, schema:drop). The Nest app builds its own
 * connection in DatabaseModule from the same shared options.
 */
import 'dotenv/config'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DataSource } from 'typeorm'
import { createDataSourceOptions } from './database.options.js'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set (see .env.example).')
}

const here = dirname(fileURLToPath(import.meta.url))
// Run through tsx the migrations are .ts; after `nest build` they are .js (skip the .d.ts).
const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js'

export default new DataSource({
    ...createDataSourceOptions(databaseUrl),
    migrations: [join(here, 'migrations', `*.${extension}`)],
})
