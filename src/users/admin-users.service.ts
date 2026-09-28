import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import argon2 from 'argon2'
import { DataSource, EntityManager, ILike, In, IsNull, Not, Repository } from 'typeorm'
import { USER_NOT_FOUND } from '../auth/auth.service.js'
import { User } from '../auth/entities/user.entity.js'
import { Role } from '../auth/role.enum.js'
import { passwordChangeInstant } from '../auth/session.config.js'
import type { AuthUser } from '../common/types/auth-user.js'
import { isDbError, omitUndefined } from '../database/db-errors.js'
import { newId } from '../database/id.js'
import type { Paginated } from '../products/product.mapper.js'
import { TelegramChat } from '../telegram/entities/telegram-chat.entity.js'
import { TelegramLinkCode } from '../telegram/entities/telegram-link-code.entity.js'
import type { CreateUserDto } from './dto/create-user.dto.js'
import type { UpdateUserDto } from './dto/update-user.dto.js'
import type { UserQueryDto } from './dto/user-query.dto.js'

/** A user as the admin's "Usuarios" page sees it (never the password hash). */
export interface AdminUserDto {
    id: string
    name: string
    email: string
    role: Role
    isActive: boolean
    createdAt: string
    updatedAt: string
    lastLoginAt: string | null
    passwordChangedAt: string | null
    /** Telegram chats this user linked (they act on this user's behalf). */
    telegramChatCount: number
    /** Of those, the ones that still receive payments. */
    activeTelegramChatCount: number
}

export interface SetUserActiveResultDto extends AdminUserDto {
    /** Chats switched off by this deactivation (0 when activating). */
    telegramChatsDeactivated: number
}

export const USER_MESSAGES = {
    emailTaken: 'Ya existe un usuario con ese correo electrónico.',
    lastAdmin:
        'Debe quedar al menos un administrador activo. Da el rol de Administrador a otra cuenta activa antes de hacer este cambio.',
    ownRole: 'No puedes cambiar tu propio rol. Pídeselo a otro administrador.',
    ownDeactivation: 'No puedes desactivar tu propia cuenta. Pídeselo a otro administrador.',
    ownPassword: 'Para cambiar tu propia contraseña usa "Mi cuenta".',
} as const

/**
 * Every write takes this transaction-scoped advisory lock first, so two admins acting at the
 * same time (e.g. deactivating each other) are serialized and the "at least one active ADMIN"
 * check always sees the other's change.
 */
const USERS_LOCK_KEY = 7_424_001

function escapeLike(value: string): string {
    return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

function toDto(user: User, chats: readonly Pick<TelegramChat, 'isActive'>[]): AdminUserDto {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
        telegramChatCount: chats.length,
        activeTelegramChatCount: chats.filter((chat) => chat.isActive).length,
    }
}

/**
 * The admin "Usuarios" page (ADMIN only). Users are never deleted: deactivating keeps every
 * order, note and Telegram link pointing at them. Safety rules: an admin cannot change their
 * own role or deactivate themselves, and at least one active ADMIN always remains.
 */
@Injectable()
export class AdminUsersService {
    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        @InjectRepository(User) private readonly users: Repository<User>,
        @InjectRepository(TelegramChat) private readonly chats: Repository<TelegramChat>,
    ) {}

    async list(query: UserQueryDto): Promise<Paginated<AdminUserDto>> {
        const pattern = query.search ? `%${escapeLike(query.search)}%` : null
        const [users, total] = await this.users.findAndCount({
            where: pattern ? [{ name: ILike(pattern) }, { email: ILike(pattern) }] : {},
            order: { isActive: 'DESC', name: 'ASC', createdAt: 'ASC' },
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
        })
        const chats = users.length
            ? await this.chats.find({
                  where: { linkedByUserId: In(users.map((user) => user.id)) },
                  select: { id: true, linkedByUserId: true, isActive: true },
              })
            : []
        return {
            items: users.map((user) =>
                toDto(
                    user,
                    chats.filter((chat) => chat.linkedByUserId === user.id),
                ),
            ),
            page: query.page,
            pageSize: query.pageSize,
            total,
            totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
        }
    }

    async get(id: string): Promise<AdminUserDto> {
        const user = await this.users.findOneBy({ id })
        if (!user) throw new NotFoundException(USER_NOT_FOUND)
        return toDto(user, await this.chats.find({ where: { linkedByUserId: id } }))
    }

    async create(dto: CreateUserDto): Promise<AdminUserDto> {
        const id = newId()
        const passwordHash = await argon2.hash(dto.password)
        await this.write(async (manager) => {
            const users = manager.getRepository(User)
            if (await users.existsBy({ email: dto.email })) {
                throw new ConflictException(USER_MESSAGES.emailTaken)
            }
            await users.insert({
                id,
                name: dto.name,
                email: dto.email,
                role: dto.role,
                passwordHash,
                isActive: true,
                passwordChangedAt: null,
                lastLoginAt: null,
            })
        })
        return this.get(id)
    }

    async update(id: string, dto: UpdateUserDto, actor: AuthUser): Promise<AdminUserDto> {
        await this.write(async (manager) => {
            const users = manager.getRepository(User)
            const user = await this.find(users, id)
            if (dto.role !== undefined && dto.role !== user.role) {
                if (user.id === actor.id) throw new ConflictException(USER_MESSAGES.ownRole)
                if (user.role === Role.ADMIN && user.isActive) {
                    await this.assertAnotherActiveAdmin(users, user.id)
                }
            }
            if (dto.email !== undefined && dto.email !== user.email) {
                if (await users.existsBy({ email: dto.email, id: Not(id) })) {
                    throw new ConflictException(USER_MESSAGES.emailTaken)
                }
            }
            const changes = omitUndefined({ name: dto.name, email: dto.email, role: dto.role })
            if (Object.keys(changes).length) await users.update({ id }, changes)
        })
        return this.get(id)
    }

    /**
     * An ADMIN sets a new password for someone else ("Restablecer contraseña"). Every session
     * of that user is closed (JwtAuthGuard rejects tokens issued before the change).
     */
    async setPassword(id: string, password: string, actor: AuthUser): Promise<void> {
        if (id === actor.id) throw new ConflictException(USER_MESSAGES.ownPassword)
        const passwordHash = await argon2.hash(password)
        await this.write(async (manager) => {
            const users = manager.getRepository(User)
            await this.find(users, id)
            await users.update({ id }, { passwordHash, passwordChangedAt: passwordChangeInstant() })
        })
    }

    /**
     * Deactivating closes the user's sessions at once (the guard re-reads the user), switches
     * off the Telegram chats they linked (so a former employee stops receiving payment data)
     * and burns their unused link codes. Reactivating does not switch the chats back on: a
     * chat comes back when it writes to the bot again, or is linked again.
     */
    async setActive(
        id: string,
        isActive: boolean,
        actor: AuthUser,
    ): Promise<SetUserActiveResultDto> {
        let telegramChatsDeactivated = 0
        await this.write(async (manager) => {
            const users = manager.getRepository(User)
            const user = await this.find(users, id)
            if (user.isActive === isActive) return
            if (!isActive) {
                if (user.id === actor.id) throw new ConflictException(USER_MESSAGES.ownDeactivation)
                if (user.role === Role.ADMIN) await this.assertAnotherActiveAdmin(users, user.id)
                const chats = await manager
                    .getRepository(TelegramChat)
                    .update({ linkedByUserId: id, isActive: true }, { isActive: false })
                telegramChatsDeactivated = chats.affected ?? 0
                await manager
                    .getRepository(TelegramLinkCode)
                    .delete({ createdByUserId: id, usedAt: IsNull() })
            }
            await users.update({ id }, { isActive })
        })
        return { ...(await this.get(id)), telegramChatsDeactivated }
    }

    /** Runs `work` in a transaction holding the users lock; maps a unique-email race to 409. */
    private async write(work: (manager: EntityManager) => Promise<void>): Promise<void> {
        try {
            await this.dataSource.transaction(async (manager) => {
                await manager.query('SELECT pg_advisory_xact_lock($1)', [USERS_LOCK_KEY])
                await work(manager)
            })
        } catch (error) {
            if (isDbError(error, '23505')) throw new ConflictException(USER_MESSAGES.emailTaken)
            throw error
        }
    }

    private async find(users: Repository<User>, id: string): Promise<User> {
        const user = await users.findOneBy({ id })
        if (!user) throw new NotFoundException(USER_NOT_FOUND)
        return user
    }

    /** 409 unless some other ADMIN is active (checked under the users lock). */
    private async assertAnotherActiveAdmin(users: Repository<User>, exceptId: string) {
        const others = await users.count({
            where: { role: Role.ADMIN, isActive: true, id: Not(exceptId) },
        })
        if (others === 0) throw new ConflictException(USER_MESSAGES.lastAdmin)
    }
}
