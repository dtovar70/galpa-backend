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
import { User } from '../../auth/entities/user.entity.js'

/**
 * One-time 6-digit code an admin generates to link a chat (`/start <code>`). Only an HMAC of the
 * code is stored; it lasts 10 minutes and works once.
 */
@Entity({ name: 'telegram_link_codes' })
@Index('telegram_link_codes_code_hash_idx', ['codeHash'])
@Check('telegram_link_codes_code_hash_check', `"code_hash" ~ '^[a-f0-9]{64}$'`)
export class TelegramLinkCode {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'telegram_link_codes_pkey' })
    id: string

    @Column({ name: 'code_hash', type: 'text' })
    codeHash: string

    @Column({ name: 'created_by_user_id', type: 'text' })
    createdByUserId: string

    @ManyToOne(() => User, { onDelete: 'CASCADE', onUpdate: 'CASCADE', nullable: false })
    @JoinColumn({
        name: 'created_by_user_id',
        foreignKeyConstraintName: 'telegram_link_codes_created_by_user_id_fkey',
    })
    createdBy: Relation<User>

    @Column({ name: 'expires_at', type: 'timestamptz', precision: 3 })
    expiresAt: Date

    @Column({ name: 'used_at', type: 'timestamptz', precision: 3, nullable: true })
    usedAt: Date | null

    @Column({ name: 'used_by_chat_id', type: 'bigint', nullable: true })
    usedByChatId: string | null

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date
}
