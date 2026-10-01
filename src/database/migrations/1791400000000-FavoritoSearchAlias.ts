import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * The store now shows the `bestseller` tag as "favorito". `search_text` is derived on save
 * (`computeSearchText`), so existing bestsellers get the alias appended here to be findable by
 * "favorito" before their next edit. Data only.
 */
export class FavoritoSearchAlias1791400000000 implements MigrationInterface {
    name = 'FavoritoSearchAlias1791400000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "products" SET "search_text" = "search_text" || ' favorito'
            WHERE 'bestseller' = ANY ("tags") AND "search_text" NOT LIKE '%favorito%'
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "products" SET "search_text" = regexp_replace("search_text", ' favorito', '', 'g')
            WHERE 'bestseller' = ANY ("tags")
        `)
    }
}
