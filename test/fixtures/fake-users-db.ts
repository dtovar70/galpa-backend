import { FindOperator } from 'typeorm'
import { PasswordResetCode } from '../../src/auth/entities/password-reset-code.entity.js'
import { User } from '../../src/auth/entities/user.entity.js'
import { TelegramChat } from '../../src/telegram/entities/telegram-chat.entity.js'
import { TelegramLinkCode } from '../../src/telegram/entities/telegram-link-code.entity.js'
import { catalogRepository } from './catalogs.js'

export type Row = Record<string, unknown>
type Where = Row | Row[] | undefined

function like(pattern: string): RegExp {
    const source = pattern
        .split(/(\\[\\%_]|%|_)/)
        .map((part) => {
            if (part === '%') return '.*'
            if (part === '_') return '.'
            if (part.startsWith('\\') && part.length === 2) return `\\${part[1]}`
            return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        })
        .join('')
    return new RegExp(`^${source}$`, 'i')
}

function matchesOne(row: Row, where: Row): boolean {
    return Object.entries(where).every(([key, expected]) => {
        const value = row[key]
        if (expected instanceof FindOperator) {
            const operand = expected.value as unknown
            if (expected.type === 'in') return (operand as unknown[]).includes(value)
            if (expected.type === 'not') return value !== operand
            if (expected.type === 'isNull') return value === null || value === undefined
            if (expected.type === 'ilike') return like(operand as string).test(String(value))
            if (expected.type === 'moreThan') return (value as Date) > (operand as Date)
            throw new Error(`Unsupported operator ${expected.type}`)
        }
        return value === expected
    })
}

function matches(row: Row, where: Where): boolean {
    if (!where) return true
    return Array.isArray(where)
        ? where.some((option) => matchesOne(row, option))
        : matchesOne(row, where)
}

/** Like TypeORM with `select: false`: the hash only comes back through `addSelect`. */
function withoutHash(row: Row): Row {
    const { passwordHash: _hash, ...rest } = row
    return { ...rest }
}

/**
 * Just enough of TypeORM, in memory, for accounts: the users table (auth, the guard and the
 * admin users API), the Telegram chats a user linked and their link codes.
 */
export class FakeUsersDb {
    readonly tables = new Map<unknown, Row[]>([
        [User, []],
        [TelegramChat, []],
        [TelegramLinkCode, []],
        [PasswordResetCode, []],
    ])

    table(entity: unknown): Row[] {
        const rows = this.tables.get(entity)
        if (!rows) throw new Error('Unknown entity')
        return rows
    }

    user(id: string): Row {
        const row = this.table(User).find((candidate) => candidate.id === id)
        if (!row) throw new Error(`No user ${id}`)
        return row
    }

    private queryBuilder() {
        const params: Row = {}
        const builder = {
            addSelect: () => builder,
            where: (_sql: string, values: Row = {}) => (Object.assign(params, values), builder),
            getOne: () => {
                const found = this.table(User).find((row) =>
                    params.id !== undefined
                        ? row.id === params.id
                        : String(row.email).toLowerCase() === params.email,
                )
                return Promise.resolve(found ? { ...found } : null)
            },
        }
        return builder
    }

    repository(entity: unknown) {
        const catalog = catalogRepository(entity)
        if (catalog) return catalog
        if (!this.tables.has(entity)) {
            return {
                find: () => Promise.resolve([]),
                findOne: () => Promise.resolve(null),
                findOneBy: () => Promise.resolve(null),
            }
        }
        const rows = () => this.table(entity)
        const read = (row: Row) => (entity === User ? withoutHash(row) : { ...row })
        const find = (where?: Where) => rows().filter((row) => matches(row, where))
        return {
            find: (options: { where?: Where } = {}) =>
                Promise.resolve(find(options.where).map(read)),
            findOne: (options: { where?: Where; order?: Record<string, 'ASC' | 'DESC'> }) => {
                const found = find(options.where)
                const [key, direction] = Object.entries(options.order ?? {})[0] ?? []
                if (key) {
                    found.sort((a, b) => {
                        const diff = (a[key] as Date).getTime() - (b[key] as Date).getTime()
                        return direction === 'DESC' ? -diff : diff
                    })
                }
                return Promise.resolve(found[0] ? read(found[0]) : null)
            },
            findOneBy: (where: Row) => {
                const found = find(where)[0]
                return Promise.resolve(found ? read(found) : null)
            },
            findAndCount: (
                options: { where?: Where; skip?: number; take?: number } = {},
            ): Promise<[Row[], number]> => {
                const found = find(options.where).sort(
                    (a, b) =>
                        Number(b.isActive) - Number(a.isActive) ||
                        String(a.name).localeCompare(String(b.name)),
                )
                const skip = options.skip ?? 0
                const page = found.slice(skip, skip + (options.take ?? found.length))
                return Promise.resolve([page.map(read), found.length])
            },
            existsBy: (where: Row) => Promise.resolve(find(where).length > 0),
            count: (options: { where?: Where } = {}) => Promise.resolve(find(options.where).length),
            insert: (row: Row) => {
                const now = new Date()
                if (entity === User) {
                    const email = String(row.email).toLowerCase()
                    if (rows().some((other) => String(other.email).toLowerCase() === email)) {
                        throw new Error('unique violation in the fake (the service must check)')
                    }
                }
                rows().push({ createdAt: now, updatedAt: now, ...row })
                return Promise.resolve({})
            },
            update: (where: Row, changes: Row) => {
                const hit = find(where)
                for (const row of hit) {
                    Object.assign(row, changes, entity === User ? { updatedAt: new Date() } : {})
                }
                return Promise.resolve({ affected: hit.length })
            },
            delete: (where: Row) => {
                const keep = rows().filter((row) => !matches(row, where))
                const affected = rows().length - keep.length
                this.tables.set(entity, keep)
                return Promise.resolve({ affected })
            },
            query: (sql: string, params: unknown[] = []) => {
                if (sql.includes('UPDATE "password_reset_codes"')) {
                    // The atomic attempt claim of PasswordResetService.
                    const [id, maxAttempts] = params as [string, number]
                    const row = rows().find(
                        (candidate) =>
                            candidate.id === id &&
                            candidate.usedAt === null &&
                            (candidate.expiresAt as Date) > new Date() &&
                            (candidate.attempts as number) < maxAttempts,
                    )
                    if (!row) return Promise.resolve([])
                    row.attempts = (row.attempts as number) + 1
                    return Promise.resolve([{ codeHash: row.codeHash }])
                }
                if (sql.includes('"last_login_at" = now()')) {
                    const row = rows().find((candidate) => candidate.id === params[0])
                    if (row) row.lastLoginAt = new Date()
                    return Promise.resolve([])
                }
                throw new Error(`Unexpected SQL: ${sql}`)
            },
            createQueryBuilder: () => this.queryBuilder(),
        }
    }

    readonly manager = {
        query: (sql: string): Promise<unknown[]> => {
            if (sql.includes('pg_advisory_xact_lock')) return Promise.resolve([])
            throw new Error(`Unexpected SQL: ${sql}`)
        },
        getRepository: (entity: unknown) => this.repository(entity),
    }

    readonly dataSource = {
        isInitialized: false,
        entityMetadatas: [],
        options: { type: 'postgres' },
        manager: this.manager,
        getRepository: (entity: unknown) => this.repository(entity),
        transaction: <T>(work: (manager: FakeUsersDb['manager']) => Promise<T>) =>
            work(this.manager),
    }
}
