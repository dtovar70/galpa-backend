import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Phase 4, the Telegram bot. Schema only, no data changes:
 *
 * - `telegram_chats`: chats linked with a one-time code. `chat_id` is Telegram's id (bigint,
 *   unique). `linked_by_user_id` → `users` (SET NULL): the admin the bot acts for.
 * - `telegram_link_codes`: the one-time codes (HMAC-SHA-256 hex, 10 minutes, single use).
 *   `created_by_user_id` → `users` (CASCADE).
 * - `telegram_messages`: every message the bot sent about an order, so it can edit them later.
 *   `chat_id` → `telegram_chats.chat_id` (CASCADE: unlinking forgets them), `order_id` →
 *   `orders` and `payment_id` → `order_payments` (both CASCADE).
 *
 * `down()` drops the three tables.
 */
export class TelegramBot1790800000000 implements MigrationInterface {
    name = 'TelegramBot1790800000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "telegram_chats" (
                "id" text NOT NULL,
                "chat_id" bigint NOT NULL,
                "username" varchar(100),
                "first_name" varchar(100),
                "linked_by_user_id" text,
                "is_active" boolean NOT NULL DEFAULT true,
                "notify_new_orders" boolean NOT NULL DEFAULT false,
                "linked_at" timestamptz(3) NOT NULL DEFAULT now(),
                "last_seen_at" timestamptz(3),
                CONSTRAINT "telegram_chats_pkey" PRIMARY KEY ("id")
            )
        `)
        await queryRunner.query(
            `CREATE UNIQUE INDEX "telegram_chats_chat_id_key" ON "telegram_chats" ("chat_id")`,
        )
        await queryRunner.query(`
            ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_linked_by_user_id_fkey"
            FOREIGN KEY ("linked_by_user_id") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE CASCADE
        `)

        await queryRunner.query(`
            CREATE TABLE "telegram_link_codes" (
                "id" text NOT NULL,
                "code_hash" text NOT NULL,
                "created_by_user_id" text NOT NULL,
                "expires_at" timestamptz(3) NOT NULL,
                "used_at" timestamptz(3),
                "used_by_chat_id" bigint,
                "created_at" timestamptz(3) NOT NULL DEFAULT now(),
                CONSTRAINT "telegram_link_codes_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "telegram_link_codes_code_hash_check"
                    CHECK ("code_hash" ~ '^[a-f0-9]{64}$')
            )
        `)
        await queryRunner.query(
            `CREATE INDEX "telegram_link_codes_code_hash_idx" ON "telegram_link_codes" ("code_hash")`,
        )
        await queryRunner.query(`
            ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_created_by_user_id_fkey"
            FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        `)

        await queryRunner.query(`
            CREATE TABLE "telegram_messages" (
                "id" text NOT NULL,
                "chat_id" bigint NOT NULL,
                "message_id" integer NOT NULL,
                "order_id" text NOT NULL,
                "payment_id" text,
                "kind" text NOT NULL,
                "resolution" text,
                "created_at" timestamptz(3) NOT NULL DEFAULT now(),
                CONSTRAINT "telegram_messages_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "telegram_messages_kind_check" CHECK ("kind" IN ('payment', 'payment_caption', 'payment_photo', 'new_order', 'prompt'))
            )
        `)
        await queryRunner.query(
            `CREATE INDEX "telegram_messages_order_id_idx" ON "telegram_messages" ("order_id")`,
        )
        await queryRunner.query(
            `CREATE INDEX "telegram_messages_payment_id_idx" ON "telegram_messages" ("payment_id")`,
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "telegram_messages_chat_message_key" ON "telegram_messages" ("chat_id", "message_id")`,
        )
        await queryRunner.query(`
            ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_chat_id_fkey"
            FOREIGN KEY ("chat_id") REFERENCES "telegram_chats"("chat_id")
            ON DELETE CASCADE ON UPDATE CASCADE
        `)
        await queryRunner.query(`
            ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_order_id_fkey"
            FOREIGN KEY ("order_id") REFERENCES "orders"("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        `)
        await queryRunner.query(`
            ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_payment_id_fkey"
            FOREIGN KEY ("payment_id") REFERENCES "order_payments"("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "telegram_messages"`)
        await queryRunner.query(`DROP TABLE "telegram_link_codes"`)
        await queryRunner.query(`DROP TABLE "telegram_chats"`)
    }
}
