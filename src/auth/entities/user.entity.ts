import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import { Role } from '../role.enum.js'

@Entity({ name: 'users' })
@Index('users_email_key', ['email'], { unique: true })
export class User {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'users_pkey' })
    id: string

    @Column({ type: 'text' })
    email: string

    /** Never selected unless explicitly requested (`addSelect('user.passwordHash')`). */
    @Column({ name: 'password_hash', type: 'text', select: false })
    passwordHash: string

    @Column({ type: 'text' })
    name: string

    @Column({ type: 'enum', enum: Role, enumName: 'Role', default: Role.ADMIN })
    role: Role

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date

    @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
    updatedAt: Date
}
