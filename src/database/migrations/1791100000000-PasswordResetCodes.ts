import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Admin password recovery ("¿Olvidaste tu contraseña?"). Schema only, no data changes:
 *
 * - `password_reset_codes`: one-time 6-digit codes, stored as HMAC-SHA-256 hex (keyed with
 *   `JWT_SECRET`). `user_id` → `users` (CASCADE). `channel` is how the code was sent
 *   (`telegram`; `email` from Phase 5). A code lasts 10 minutes (`expires_at`), allows 5
 *   `attempts` and works once (`used_at`). `requester_ip` keeps who asked, for auditing.
 *
 * `down()` drops the table.
 */
export class PasswordResetCodes1791100000000 implements MigrationInterface {
    name = 'PasswordResetCodes1791100000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "password_reset_codes" (
                "id" text NOT NULL,
                "user_id" text NOT NULL,
                "code_hash" text NOT NULL,
                "channel" varchar(20) NOT NULL,
                "expires_at" timestamptz(3) NOT NULL,
                "attempts" integer NOT NULL DEFAULT 0,
                "used_at" timestamptz(3),
                "created_at" timestamptz(3) NOT NULL DEFAULT now(),
                "requester_ip" varchar(64),
                CONSTRAINT "password_reset_codes_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "password_reset_codes_code_hash_check"
                    CHECK ("code_hash" ~ '^[a-f0-9]{64}$'),
                CONSTRAINT "password_reset_codes_channel_check"
                    CHECK ("channel" IN ('telegram', 'email')),
                CONSTRAINT "password_reset_codes_attempts_check" CHECK ("attempts" >= 0)
            )
        `)
        await queryRunner.query(
            `CREATE INDEX "password_reset_codes_user_id_created_at_idx" ON "password_reset_codes" ("user_id", "created_at")`,
        )
        await queryRunner.query(`
            ALTER TABLE "password_reset_codes" ADD CONSTRAINT "password_reset_codes_user_id_fkey"
            FOREIGN KEY ("user_id") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "password_reset_codes"`)
    }
}
