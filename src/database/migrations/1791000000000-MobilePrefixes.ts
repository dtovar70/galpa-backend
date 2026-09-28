import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Operator codes, in select order, and whether they are offered. 0426 (Movilnet) exists but the
 * owner did not list it: it is seeded inactive and can be activated in Catálogos.
 */
const PREFIXES = [
    ['0412', true],
    ['0414', true],
    ['0416', true],
    ['0422', true],
    ['0424', true],
    ['0426', false],
] as const

/**
 * The Venezuelan mobile operator codes become a catalog (`mobile_prefixes`), like the banks. Every
 * mobile phone field (content WhatsApp and Pago Móvil, the checkout phone, the payment proofs)
 * only accepts an active code for new saves.
 *
 * Phones stay stored as text ("0424-1234567"): there is no foreign key and no data changes, so
 * values already stored with a code that is inactive, or missing here, keep showing as they are.
 */
export class MobilePrefixes1791000000000 implements MigrationInterface {
    name = 'MobilePrefixes1791000000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "mobile_prefixes" (
                "code" varchar(4) NOT NULL,
                "is_active" boolean NOT NULL DEFAULT true,
                "sort_order" integer NOT NULL DEFAULT 0,
                CONSTRAINT "mobile_prefixes_pkey" PRIMARY KEY ("code"),
                CONSTRAINT "mobile_prefixes_code_check" CHECK ("code" ~ '^04[0-9]{2}$')
            )
        `)
        await queryRunner.query(
            `INSERT INTO "mobile_prefixes" ("code", "is_active", "sort_order")
             VALUES ${PREFIXES.map((_, row) => `($${row * 3 + 1}, $${row * 3 + 2}, $${row * 3 + 3})`).join(', ')}`,
            PREFIXES.flatMap(([code, isActive], index) => [code, isActive, index]),
        )
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "mobile_prefixes"`)
    }
}
