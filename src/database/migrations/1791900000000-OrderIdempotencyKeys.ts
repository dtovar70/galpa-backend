import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Checkout retries: `orders.idempotency_key` (the `Idempotency-Key` header of `POST /orders`,
 * unique while set) and `orders.idempotency_hash` (SHA-256 of the request body), both null for
 * orders placed without the header and once a key is older than 24 h and gets freed. See
 * `order-idempotency.ts`.
 */
export class OrderIdempotencyKeys1791900000000 implements MigrationInterface {
    name = 'OrderIdempotencyKeys1791900000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "orders"
                ADD "idempotency_key" varchar(64),
                ADD "idempotency_hash" varchar(64),
                ADD CONSTRAINT "orders_idempotency_check"
                    CHECK (("idempotency_key" IS NULL) = ("idempotency_hash" IS NULL))
        `)
        await queryRunner.query(
            `CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders" ("idempotency_key")`,
        )
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "orders_idempotency_key_key"`)
        await queryRunner.query(`
            ALTER TABLE "orders"
                DROP CONSTRAINT "orders_idempotency_check",
                DROP COLUMN "idempotency_hash",
                DROP COLUMN "idempotency_key"
        `)
    }
}
