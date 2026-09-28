import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'
import { Role } from '../role.enum.js'

@Entity({ name: 'users' })
@Index('users_email_key', ['email'], { unique: true })
/** `UNIQUE (lower(email))`, created by hand in a migration (TypeORM cannot express it). */
@Index('users_email_lower_key', { synchronize: false })
export class User {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'users_pkey' })
    id: string

    /** Always stored lowercase; unique ignoring case. */
    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    email: string

    /** Never selected unless explicitly requested (`addSelect('user.passwordHash')`). */
    @Column({ name: 'password_hash', type: 'text', select: false })
    passwordHash: string

    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    name: string

    @Column({ type: 'enum', enum: Role, enumName: 'Role', default: Role.ADMIN })
    role: Role

    /**
     * False once an ADMIN deactivates the account: it cannot log in and its sessions stop
     * working. Users are never deleted, so the history keeps pointing at them.
     */
    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive: boolean

    /**
     * Last password change or reset, always a whole second. Session tokens issued before it
     * (`iat` is in seconds) are rejected, so a change logs out every other session.
     */
    @Column({ name: 'password_changed_at', type: 'timestamptz', precision: 3, nullable: true })
    passwordChangedAt: Date | null

    @Column({ name: 'last_login_at', type: 'timestamptz', precision: 3, nullable: true })
    lastLoginAt: Date | null

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
    updatedAt: Date
}
