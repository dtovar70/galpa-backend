import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Admin user management. Schema only, no data changes:
 *
 * - `users.is_active` (default true): a deactivated user cannot log in and its sessions stop
 *   working. There is no hard delete, so orders, notes and Telegram chats keep their author.
 * - `users.password_changed_at` (nullable): session tokens issued before it are rejected.
 * - `users.last_login_at` (nullable): shown in the admin's user list.
 * - `users_email_lower_key`: emails are unique ignoring case. The API stores them lowercase;
 *   the index also covers rows written by hand. It fails to build if two existing emails only
 *   differ in case (fix those rows first).
 *
 * `down()` drops the index and the three columns.
 */
export class AdminUserManagement1790900000000 implements MigrationInterface {
    name = 'AdminUserManagement1790900000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "users"
                ADD "is_active" boolean NOT NULL DEFAULT true,
                ADD "password_changed_at" timestamptz(3),
                ADD "last_login_at" timestamptz(3)
        `)
        await queryRunner.query(
            `CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"))`,
        )
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "users_email_lower_key"`)
        await queryRunner.query(`
            ALTER TABLE "users"
                DROP COLUMN "last_login_at",
                DROP COLUMN "password_changed_at",
                DROP COLUMN "is_active"
        `)
    }
}
