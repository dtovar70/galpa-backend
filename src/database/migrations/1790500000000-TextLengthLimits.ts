import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Length limits enforced by the database, matching the DTOs and the admin/storefront fields:
 *
 * - Every column behind a single-line field becomes `varchar(100)` (`TEXT_INPUT_MAX_LENGTH`).
 *   `products.category_slug` follows `categories.slug`, the key it references.
 * - Columns behind multi-line fields (textareas) keep `text` with a `char_length` CHECK at the
 *   same limit as their DTO.
 * - `products.highlights` (`text[]`) is capped at 6 items, each up to 100 characters. A CHECK
 *   cannot hold a subquery, so the per-item length goes through the IMMUTABLE helper
 *   `max_text_array_item_length(text[])`.
 *
 * Not constrained on purpose: order item snapshots (`product_name`, `product_slug`,
 * `variant_label`), which copy whatever the product had when ordered; `order_status_history.note`,
 * which the server composes from the admin note plus system notes; and `site_content.value`
 * (jsonb), whose per-field limits live in the content DTOs.
 *
 * Existing data: checked before writing this migration (dev database, 2026-09-24); no value was
 * longer than the new limits, so nothing is truncated. If another database has longer values the
 * `ALTER ... TYPE varchar(100)` / `ADD CONSTRAINT` fails and the whole migration rolls back.
 */
export class TextLengthLimits1790500000000 implements MigrationInterface {
    name = 'TextLengthLimits1790500000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE FUNCTION "max_text_array_item_length"(items text[]) RETURNS integer
            LANGUAGE sql IMMUTABLE PARALLEL SAFE
            AS $$ SELECT coalesce(max(char_length(item)), 0) FROM unnest(items) AS item $$
        `)

        await queryRunner.query(`
            ALTER TABLE "categories"
                ALTER COLUMN "slug" TYPE varchar(100),
                ALTER COLUMN "name" TYPE varchar(100),
                ALTER COLUMN "tagline" TYPE varchar(100),
                ALTER COLUMN "color_hex" TYPE varchar(100),
                ADD CONSTRAINT "categories_description_length_check"
                    CHECK (char_length("description") <= 1000)
        `)
        await queryRunner.query(`
            ALTER TABLE "products"
                ALTER COLUMN "slug" TYPE varchar(100),
                ALTER COLUMN "name" TYPE varchar(100),
                ALTER COLUMN "category_slug" TYPE varchar(100),
                ALTER COLUMN "print_text" TYPE varchar(100),
                ALTER COLUMN "color_hex" TYPE varchar(100),
                ADD CONSTRAINT "products_description_length_check"
                    CHECK (char_length("description") <= 4000),
                ADD CONSTRAINT "products_highlights_count_check"
                    CHECK (cardinality("highlights") <= 6),
                ADD CONSTRAINT "products_highlights_length_check"
                    CHECK (max_text_array_item_length("highlights") <= 100)
        `)
        await queryRunner.query(`
            ALTER TABLE "product_variants"
                ALTER COLUMN "label" TYPE varchar(100),
                ALTER COLUMN "color_hex" TYPE varchar(100)
        `)
        await queryRunner.query(`ALTER TABLE "product_images" ALTER COLUMN "alt" TYPE varchar(100)`)
        await queryRunner.query(`
            ALTER TABLE "users"
                ALTER COLUMN "email" TYPE varchar(100),
                ALTER COLUMN "name" TYPE varchar(100)
        `)
        await queryRunner.query(`
            ALTER TABLE "orders"
                ALTER COLUMN "customer_name" TYPE varchar(100),
                ALTER COLUMN "customer_email" TYPE varchar(100),
                ALTER COLUMN "customer_phone" TYPE varchar(100),
                ALTER COLUMN "city" TYPE varchar(100),
                ALTER COLUMN "address" TYPE varchar(100),
                ALTER COLUMN "refund_reference" TYPE varchar(100),
                ADD CONSTRAINT "orders_notes_length_check" CHECK (char_length("notes") <= 300)
        `)
        await queryRunner.query(`
            ALTER TABLE "order_items"
                ADD CONSTRAINT "order_items_personalization_length_check"
                    CHECK (char_length("personalization") <= 140)
        `)
        await queryRunner.query(`
            ALTER TABLE "order_payments"
                ALTER COLUMN "reference" TYPE varchar(100),
                ALTER COLUMN "payer_phone" TYPE varchar(100),
                ALTER COLUMN "payer_id_number" TYPE varchar(100),
                ADD CONSTRAINT "order_payments_rejection_reason_length_check"
                    CHECK (char_length("rejection_reason") <= 500)
        `)
        await queryRunner.query(`
            ALTER TABLE "order_notes"
                ADD CONSTRAINT "order_notes_body_length_check" CHECK (char_length("body") <= 1000)
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order_notes" DROP CONSTRAINT "order_notes_body_length_check"`,
        )
        await queryRunner.query(`
            ALTER TABLE "order_payments"
                DROP CONSTRAINT "order_payments_rejection_reason_length_check",
                ALTER COLUMN "payer_id_number" TYPE text,
                ALTER COLUMN "payer_phone" TYPE text,
                ALTER COLUMN "reference" TYPE text
        `)
        await queryRunner.query(
            `ALTER TABLE "order_items" DROP CONSTRAINT "order_items_personalization_length_check"`,
        )
        await queryRunner.query(`
            ALTER TABLE "orders"
                DROP CONSTRAINT "orders_notes_length_check",
                ALTER COLUMN "refund_reference" TYPE text,
                ALTER COLUMN "address" TYPE text,
                ALTER COLUMN "city" TYPE text,
                ALTER COLUMN "customer_phone" TYPE text,
                ALTER COLUMN "customer_email" TYPE text,
                ALTER COLUMN "customer_name" TYPE text
        `)
        await queryRunner.query(`
            ALTER TABLE "users"
                ALTER COLUMN "name" TYPE text,
                ALTER COLUMN "email" TYPE text
        `)
        await queryRunner.query(`ALTER TABLE "product_images" ALTER COLUMN "alt" TYPE text`)
        await queryRunner.query(`
            ALTER TABLE "product_variants"
                ALTER COLUMN "color_hex" TYPE text,
                ALTER COLUMN "label" TYPE text
        `)
        await queryRunner.query(`
            ALTER TABLE "products"
                DROP CONSTRAINT "products_highlights_length_check",
                DROP CONSTRAINT "products_highlights_count_check",
                DROP CONSTRAINT "products_description_length_check",
                ALTER COLUMN "color_hex" TYPE text,
                ALTER COLUMN "print_text" TYPE text,
                ALTER COLUMN "category_slug" TYPE text,
                ALTER COLUMN "name" TYPE text,
                ALTER COLUMN "slug" TYPE text
        `)
        await queryRunner.query(`
            ALTER TABLE "categories"
                DROP CONSTRAINT "categories_description_length_check",
                ALTER COLUMN "color_hex" TYPE text,
                ALTER COLUMN "tagline" TYPE text,
                ALTER COLUMN "name" TYPE text,
                ALTER COLUMN "slug" TYPE text
        `)
        await queryRunner.query(`DROP FUNCTION "max_text_array_item_length"(text[])`)
    }
}
