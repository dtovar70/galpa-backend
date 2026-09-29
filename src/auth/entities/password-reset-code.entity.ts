import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryColumn,
    type Relation,
} from 'typeorm'
import {
    PASSWORD_RESET_CHANNELS,
    type PasswordResetChannelId,
} from '../password-reset/password-reset.channel.js'
import { User } from './user.entity.js'

/**
 * A one-time 6-digit code to reset a panel password ("¿Olvidaste tu contraseña?"). Only an
 * HMAC of the code is stored. It lasts 10 minutes, allows 5 attempts and works once; asking for
 * a new one invalidates the user's previous unused codes.
 */
@Entity({ name: 'password_reset_codes' })
@Index('password_reset_codes_user_id_created_at_idx', ['userId', 'createdAt'])
@Check('password_reset_codes_code_hash_check', `"code_hash" ~ '^[a-f0-9]{64}$'`)
@Check(
    'password_reset_codes_channel_check',
    `"channel" IN (${PASSWORD_RESET_CHANNELS.map((channel) => `'${channel}'`).join(', ')})`,
)
@Check('password_reset_codes_attempts_check', `"attempts" >= 0`)
export class PasswordResetCode {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'password_reset_codes_pkey' })
    id: string

    @Column({ name: 'user_id', type: 'text' })
    userId: string

    @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'user_id', foreignKeyConstraintName: 'password_reset_codes_user_id_fkey' })
    user: Relation<User>

    /** HMAC-SHA-256 (hex) of the code, keyed with JWT_SECRET (see `reset-code.ts`). */
    @Column({ name: 'code_hash', type: 'text' })
    codeHash: string

    /** How the code was sent (`telegram` or `email`). */
    @Column({ type: 'varchar', length: 20 })
    channel: PasswordResetChannelId

    @Column({ name: 'expires_at', type: 'timestamptz', precision: 3 })
    expiresAt: Date

    /** Every confirmation attempt counts, right or wrong; at 5 the code is burned. */
    @Column({ type: 'integer', default: 0 })
    attempts: number

    @Column({ name: 'used_at', type: 'timestamptz', precision: 3, nullable: true })
    usedAt: Date | null

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date

    /** Client IP that asked for the code (for the audit trail; never shown to customers). */
    @Column({ name: 'requester_ip', type: 'varchar', length: 64, nullable: true })
    requesterIp: string | null
}
