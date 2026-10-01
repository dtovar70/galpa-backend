import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * "Diseña con tu imagen" (Stage 1). Schema only, no data changes:
 *
 * - `designs`: a customer's own image placed on a personalizable product, uploaded before
 *   checkout. Private storage keys of the original (for printing) and of the mockup preview,
 *   the original's format and pixel size, the `placement` (jsonb, see DesignPlacement), the API's
 *   `dpi_estimate`, and the SHA-256 (hex) of the preview token given to the customer's browser.
 *   `product_id` → `products` (SET NULL); `variant_id` has no foreign key, like `order_items`.
 *   `attached_at` is set when checkout attaches it; unattached rows older than 7 days are
 *   deleted (files first) by the cleanup job, hence the (`attached_at`, `created_at`) index.
 * - `order_items.design_id` → `designs` (RESTRICT, so an attached design is never deleted),
 *   unique: one design per line and one line per design.
 *
 * `down()` drops the column and the table (stored files are not touched).
 */
export class CustomerDesigns1791500000000 implements MigrationInterface {
    name = 'CustomerDesigns1791500000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "designs" (
                "id" text NOT NULL,
                "product_id" text,
                "variant_id" text,
                "original_key" text NOT NULL,
                "original_format" varchar(8) NOT NULL,
                "original_width" integer NOT NULL,
                "original_height" integer NOT NULL,
                "original_bytes" integer NOT NULL,
                "preview_key" text NOT NULL,
                "placement" jsonb NOT NULL,
                "dpi_estimate" integer NOT NULL,
                "preview_token_hash" text NOT NULL,
                "attached_at" timestamptz(3),
                "created_at" timestamptz(3) NOT NULL DEFAULT now(),
                CONSTRAINT "designs_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "designs_preview_token_hash_check"
                    CHECK ("preview_token_hash" ~ '^[a-f0-9]{64}$'),
                CONSTRAINT "designs_original_format_check"
                    CHECK ("original_format" IN ('jpg', 'png', 'webp')),
                CONSTRAINT "designs_original_size_check"
                    CHECK ("original_width" > 0 AND "original_height" > 0 AND "original_bytes" > 0)
            )
        `)
        await queryRunner.query(`CREATE INDEX "designs_product_id_idx" ON "designs" ("product_id")`)
        await queryRunner.query(
            `CREATE INDEX "designs_attached_at_created_at_idx" ON "designs" ("attached_at", "created_at")`,
        )
        await queryRunner.query(`
            ALTER TABLE "designs" ADD CONSTRAINT "designs_product_id_fkey"
            FOREIGN KEY ("product_id") REFERENCES "products"("id")
            ON DELETE SET NULL ON UPDATE CASCADE
        `)

        await queryRunner.query(`ALTER TABLE "order_items" ADD COLUMN "design_id" text`)
        await queryRunner.query(
            `CREATE UNIQUE INDEX "order_items_design_id_key" ON "order_items" ("design_id")`,
        )
        await queryRunner.query(`
            ALTER TABLE "order_items" ADD CONSTRAINT "order_items_design_id_fkey"
            FOREIGN KEY ("design_id") REFERENCES "designs"("id")
            ON DELETE RESTRICT ON UPDATE CASCADE
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order_items" DROP CONSTRAINT "order_items_design_id_fkey"`,
        )
        await queryRunner.query(`DROP INDEX "order_items_design_id_key"`)
        await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "design_id"`)
        await queryRunner.query(`DROP TABLE "designs"`)
    }
}
