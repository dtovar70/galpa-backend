import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Garment colors for "Plantilla para diseñar": one template photo per color instead of one per
 * category.
 *
 * - `category_design_templates`: per category (`category_slug` → `categories`, CASCADE), a color
 *   name (varchar(40), unique per category ignoring case) and `#RRGGBB` swatch, the public photo
 *   (`image_url`, `public_id`, pixel `width` × `height`), its print area (jsonb
 *   `{ x, y, width, height }`, 0..1) and a `sort_order`. At most 6 per category (checked by the
 *   API). The print size in cm stays on `categories`: it is the same for every color.
 * - Data: a category's existing photo becomes its first color, "Blanco" (#FFFFFF), keeping its
 *   area (or a centered one, should it have none). Then the photo and area columns of
 *   `categories` are dropped.
 * - `designs.color_name` / `designs.color_hex`: snapshot of the garment color the customer chose
 *   (both or none; none for the illustration templates and for older designs).
 *
 * The color is not stock-tracked: the stock stays per product version.
 *
 * `down()` puts each category's first color back as its single photo (the other colors' rows
 * are dropped; their stored photos are not deleted) and drops the design columns.
 */
export class GarmentColorTemplates1791700000000 implements MigrationInterface {
    name = 'GarmentColorTemplates1791700000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "category_design_templates" (
                "id" text NOT NULL,
                "category_slug" varchar(100) NOT NULL,
                "color_name" varchar(40) NOT NULL,
                "color_hex" varchar(7) NOT NULL,
                "image_url" text NOT NULL,
                "public_id" text NOT NULL,
                "width" integer NOT NULL,
                "height" integer NOT NULL,
                "print_area" jsonb NOT NULL,
                "sort_order" integer NOT NULL DEFAULT 0,
                "created_at" timestamptz(3) NOT NULL DEFAULT now(),
                CONSTRAINT "category_design_templates_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "category_design_templates_color_hex_check"
                    CHECK ("color_hex" ~ '^#[0-9A-F]{6}$'),
                CONSTRAINT "category_design_templates_color_name_check"
                    CHECK (char_length(btrim("color_name")) > 0),
                CONSTRAINT "category_design_templates_size_check"
                    CHECK ("width" > 0 AND "height" > 0),
                CONSTRAINT "category_design_templates_print_area_check"
                    CHECK (jsonb_typeof("print_area") = 'object'),
                CONSTRAINT "category_design_templates_category_slug_fkey"
                    FOREIGN KEY ("category_slug") REFERENCES "categories" ("slug")
                    ON DELETE CASCADE ON UPDATE CASCADE
            )
        `)
        await queryRunner.query(
            `CREATE INDEX "category_design_templates_category_slug_idx" ON "category_design_templates" ("category_slug", "sort_order")`,
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "category_design_templates_color_name_key" ON "category_design_templates" ("category_slug", lower("color_name"))`,
        )

        // The existing photo (if any) becomes the first color, "Blanco".
        await queryRunner.query(`
            INSERT INTO "category_design_templates" (
                "id", "category_slug", "color_name", "color_hex", "image_url", "public_id",
                "width", "height", "print_area", "sort_order"
            )
            SELECT
                gen_random_uuid()::text, "slug", 'Blanco', '#FFFFFF',
                "design_template_image_url", "design_template_public_id",
                "design_template_width", "design_template_height",
                COALESCE(
                    "design_print_area",
                    '{"x": 0.25, "y": 0.25, "width": 0.5, "height": 0.5}'::jsonb
                ),
                0
            FROM "categories"
            WHERE "design_template_image_url" IS NOT NULL
        `)

        await queryRunner.query(`
            ALTER TABLE "categories"
                DROP CONSTRAINT "categories_design_print_area_check",
                DROP CONSTRAINT "categories_design_template_check",
                DROP COLUMN "design_print_area",
                DROP COLUMN "design_template_height",
                DROP COLUMN "design_template_width",
                DROP COLUMN "design_template_public_id",
                DROP COLUMN "design_template_image_url"
        `)

        await queryRunner.query(`
            ALTER TABLE "designs"
                ADD COLUMN "color_name" varchar(40),
                ADD COLUMN "color_hex" varchar(7),
                ADD CONSTRAINT "designs_color_check" CHECK (
                    ("color_name" IS NULL AND "color_hex" IS NULL)
                    OR ("color_name" IS NOT NULL AND "color_hex" IS NOT NULL)
                )
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "designs"
                DROP CONSTRAINT "designs_color_check",
                DROP COLUMN "color_hex",
                DROP COLUMN "color_name"
        `)

        await queryRunner.query(`
            ALTER TABLE "categories"
                ADD COLUMN "design_template_image_url" text,
                ADD COLUMN "design_template_public_id" text,
                ADD COLUMN "design_template_width" integer,
                ADD COLUMN "design_template_height" integer,
                ADD COLUMN "design_print_area" jsonb
        `)
        // Each category's first color goes back to being its single photo.
        await queryRunner.query(`
            UPDATE "categories" AS c
            SET "design_template_image_url" = t."image_url",
                "design_template_public_id" = t."public_id",
                "design_template_width" = t."width",
                "design_template_height" = t."height",
                "design_print_area" = t."print_area"
            FROM (
                SELECT DISTINCT ON ("category_slug") *
                FROM "category_design_templates"
                ORDER BY "category_slug", "sort_order", "created_at"
            ) AS t
            WHERE c."slug" = t."category_slug"
        `)
        await queryRunner.query(`
            ALTER TABLE "categories"
                ADD CONSTRAINT "categories_design_template_check" CHECK (
                    ("design_template_image_url" IS NULL AND "design_template_public_id" IS NULL
                        AND "design_template_width" IS NULL AND "design_template_height" IS NULL)
                    OR ("design_template_image_url" IS NOT NULL
                        AND "design_template_public_id" IS NOT NULL
                        AND "design_template_width" > 0 AND "design_template_height" > 0)
                ),
                ADD CONSTRAINT "categories_design_print_area_check" CHECK (
                    "design_print_area" IS NULL
                    OR ("design_template_image_url" IS NOT NULL
                        AND jsonb_typeof("design_print_area") = 'object')
                )
        `)
        await queryRunner.query(`DROP TABLE "category_design_templates"`)
    }
}
