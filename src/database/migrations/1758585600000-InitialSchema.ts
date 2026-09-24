import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Initial schema, written by hand (no database was available to generate it). It matches the
 * entities exactly, so `db:migration:generate` against a migrated database yields no changes.
 */
export class InitialSchema1758585600000 implements MigrationInterface {
    name = 'InitialSchema1758585600000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "Role" AS ENUM ('ADMIN', 'EDITOR')`)

        await queryRunner.query(`
            CREATE TABLE "users" (
                "id" text NOT NULL,
                "email" text NOT NULL,
                "password_hash" text NOT NULL,
                "name" text NOT NULL,
                "role" "Role" NOT NULL DEFAULT 'ADMIN',
                "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
                CONSTRAINT "users_pkey" PRIMARY KEY ("id")
            )
        `)

        await queryRunner.query(`
            CREATE TABLE "categories" (
                "slug" text NOT NULL,
                "name" text NOT NULL,
                "tagline" text NOT NULL,
                "description" text NOT NULL,
                "color_hex" text NOT NULL,
                "sort_order" integer NOT NULL DEFAULT 0,
                CONSTRAINT "categories_pkey" PRIMARY KEY ("slug")
            )
        `)

        await queryRunner.query(`
            CREATE TABLE "products" (
                "id" text NOT NULL,
                "slug" text NOT NULL,
                "name" text NOT NULL,
                "category_slug" text NOT NULL,
                "price" numeric(10,2) NOT NULL,
                "compare_at_price" numeric(10,2),
                "print_text" text NOT NULL,
                "color_hex" text NOT NULL,
                "description" text NOT NULL,
                "highlights" text array NOT NULL DEFAULT '{}',
                "tags" text array NOT NULL DEFAULT '{}',
                "rating" double precision NOT NULL DEFAULT 0,
                "review_count" integer NOT NULL DEFAULT 0,
                "stock" integer NOT NULL DEFAULT 0,
                "is_active" boolean NOT NULL DEFAULT true,
                "search_text" text NOT NULL DEFAULT '',
                "relevance_score" double precision NOT NULL DEFAULT 0,
                "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
                CONSTRAINT "products_pkey" PRIMARY KEY ("id")
            )
        `)

        await queryRunner.query(`
            CREATE TABLE "product_variants" (
                "id" text NOT NULL,
                "product_id" text NOT NULL,
                "label" text NOT NULL,
                "price_delta" numeric(10,2) NOT NULL DEFAULT 0,
                "color_hex" text,
                "sort_order" integer NOT NULL DEFAULT 0,
                CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
            )
        `)

        await queryRunner.query(`
            CREATE TABLE "product_images" (
                "id" text NOT NULL,
                "product_id" text NOT NULL,
                "url" text NOT NULL,
                "public_id" text NOT NULL,
                "alt" text,
                "sort_order" integer NOT NULL DEFAULT 0,
                "created_at" TIMESTAMP(3) NOT NULL DEFAULT now(),
                CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
            )
        `)

        await queryRunner.query(`CREATE UNIQUE INDEX "users_email_key" ON "users" ("email")`)
        await queryRunner.query(`CREATE UNIQUE INDEX "products_slug_key" ON "products" ("slug")`)
        await queryRunner.query(
            `CREATE INDEX "products_category_slug_idx" ON "products" ("category_slug")`,
        )
        await queryRunner.query(
            `CREATE INDEX "products_is_active_relevance_score_idx" ON "products" ("is_active", "relevance_score")`,
        )
        await queryRunner.query(
            `CREATE INDEX "product_variants_product_id_idx" ON "product_variants" ("product_id")`,
        )
        await queryRunner.query(
            `CREATE INDEX "product_images_product_id_idx" ON "product_images" ("product_id")`,
        )

        await queryRunner.query(`
            ALTER TABLE "products" ADD CONSTRAINT "products_category_slug_fkey"
            FOREIGN KEY ("category_slug") REFERENCES "categories" ("slug")
            ON DELETE RESTRICT ON UPDATE CASCADE
        `)
        await queryRunner.query(`
            ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey"
            FOREIGN KEY ("product_id") REFERENCES "products" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        `)
        await queryRunner.query(`
            ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey"
            FOREIGN KEY ("product_id") REFERENCES "products" ("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "product_images" DROP CONSTRAINT "product_images_product_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_product_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "products" DROP CONSTRAINT "products_category_slug_fkey"`,
        )

        await queryRunner.query(`DROP INDEX "product_images_product_id_idx"`)
        await queryRunner.query(`DROP INDEX "product_variants_product_id_idx"`)
        await queryRunner.query(`DROP INDEX "products_is_active_relevance_score_idx"`)
        await queryRunner.query(`DROP INDEX "products_category_slug_idx"`)
        await queryRunner.query(`DROP INDEX "products_slug_key"`)
        await queryRunner.query(`DROP INDEX "users_email_key"`)

        await queryRunner.query(`DROP TABLE "product_images"`)
        await queryRunner.query(`DROP TABLE "product_variants"`)
        await queryRunner.query(`DROP TABLE "products"`)
        await queryRunner.query(`DROP TABLE "categories"`)
        await queryRunner.query(`DROP TABLE "users"`)
        await queryRunner.query(`DROP TYPE "Role"`)
    }
}
