import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Stock per variant: a customer could buy a size the shop no longer had as long as the product
 * total was above 0. `product_variants.stock` is the count of each version; `products.stock`
 * stays as the sum of its variants (maintained by the API in the same transactions), and is
 * the stock itself only for products without variants.
 *
 * Backfill: each product's current stock goes to its first variant (lowest `sort_order`, then
 * id) and the rest start at 0, so the owner only has to spread it; the totals are recomputed.
 *
 * `down()` drops the column; `products.stock` already holds the sum of the variants, which is
 * the right product-level count again.
 */
export class VariantStock1791300000000 implements MigrationInterface {
    name = 'VariantStock1791300000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "product_variants"
                ADD COLUMN "stock" integer NOT NULL DEFAULT 0,
                ADD CONSTRAINT "product_variants_stock_check" CHECK ("stock" >= 0)
        `)
        await queryRunner.query(`
            UPDATE "product_variants" v SET "stock" = GREATEST(p."stock", 0)
            FROM "products" p
            WHERE p."id" = v."product_id"
                AND v."id" = (
                    SELECT f."id" FROM "product_variants" f
                    WHERE f."product_id" = p."id"
                    ORDER BY f."sort_order" ASC, f."id" ASC
                    LIMIT 1
                )
        `)
        await queryRunner.query(`
            UPDATE "products" p SET "stock" = s."total"
            FROM (
                SELECT "product_id", SUM("stock") AS "total"
                FROM "product_variants"
                GROUP BY "product_id"
            ) s
            WHERE p."id" = s."product_id"
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "product_variants"
                DROP CONSTRAINT "product_variants_stock_check",
                DROP COLUMN "stock"
        `)
    }
}
