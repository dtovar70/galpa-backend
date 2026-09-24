import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Editable site content (texts and business data), one row per section. No rows are seeded: a
 * missing section renders the built-in defaults in `src/content/content.defaults.ts`.
 */
export class SiteContent1790257805143 implements MigrationInterface {
    name = 'SiteContent1790257805143'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "site_content" (
                "key" text NOT NULL,
                "value" jsonb NOT NULL,
                "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(),
                "updated_by" text,
                CONSTRAINT "site_content_pkey" PRIMARY KEY ("key")
            )
        `)
        await queryRunner.query(`
            ALTER TABLE "site_content" ADD CONSTRAINT "site_content_updated_by_fkey"
            FOREIGN KEY ("updated_by") REFERENCES "users" ("id")
            ON DELETE SET NULL ON UPDATE CASCADE
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "site_content" DROP CONSTRAINT "site_content_updated_by_fkey"`,
        )
        await queryRunner.query(`DROP TABLE "site_content"`)
    }
}
