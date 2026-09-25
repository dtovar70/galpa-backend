import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { TEXT_INPUT_MAX_LENGTH } from '../../common/validation/text-limits.js'
import { Role } from '../role.enum.js'

@Entity({ name: 'users' })
@Index('users_email_key', ['email'], { unique: true })
export class User {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'users_pkey' })
    id: string

    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    email: string

    /** Never selected unless explicitly requested (`addSelect('user.passwordHash')`). */
    @Column({ name: 'password_hash', type: 'text', select: false })
    passwordHash: string

    @Column({ type: 'varchar', length: TEXT_INPUT_MAX_LENGTH })
    name: string

    @Column({ type: 'enum', enum: Role, enumName: 'Role', default: Role.ADMIN })
    role: Role

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
    updatedAt: Date
}
