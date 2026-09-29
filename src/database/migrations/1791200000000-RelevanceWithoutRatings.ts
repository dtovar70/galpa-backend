import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * The shop has no reviews, so the seeded ratings stop driving anything. Data only, no schema
 * changes (`rating` and `review_count` stay, unused): `products.relevance_score` is recomputed
 * as bestseller (+10) + nuevo (+4), matching `computeRelevanceScore`; ties are ordered by
 * newest in the query, not here.
 *
 * `down()` restores the rating-based score.
 */
export class RelevanceWithoutRatings1791200000000 implements MigrationInterface {
    name = 'RelevanceWithoutRatings1791200000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "products" SET "relevance_score" =
                (CASE WHEN 'bestseller' = ANY ("tags") THEN 10 ELSE 0 END)
                + (CASE WHEN 'nuevo' = ANY ("tags") THEN 4 ELSE 0 END)
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "products" SET "relevance_score" =
                (CASE WHEN 'bestseller' = ANY ("tags") THEN 10 ELSE 0 END)
                + (CASE WHEN 'nuevo' = ANY ("tags") THEN 4 ELSE 0 END)
                + "rating"
        `)
    }
}
