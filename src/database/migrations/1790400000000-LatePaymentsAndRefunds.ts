import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Late Pago Móvil payments and refunds: a proof is never refused for arriving late, it is
 * flagged (`late_payment`, `order_payments.late`); an expired order that takes its stock back
 * without enough units keeps the details in `stock_conflict`; an admin can record a proof sent
 * by WhatsApp (`order_payments.source` / `recorded_by`); cancelling an order with a payment asks
 * whether money must be given back (`refund_*`).
 */
export class LatePaymentsAndRefunds1790400000000 implements MigrationInterface {
    name = 'LatePaymentsAndRefunds1790400000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "orders"
                ADD COLUMN "late_payment" boolean NOT NULL DEFAULT false,
                ADD COLUMN "stock_conflict" jsonb,
                ADD COLUMN "refund_status" text,
                ADD COLUMN "refund_reference" text,
                ADD COLUMN "refunded_at" TIMESTAMP(3) WITH TIME ZONE,
                ADD COLUMN "refunded_by" text,
                ADD CONSTRAINT "orders_refund_status_check"
                    CHECK ("refund_status" IN ('NO_APLICA', 'PENDIENTE', 'REEMBOLSADO'))
        `)
        await queryRunner.query(`
            ALTER TABLE "orders" ADD CONSTRAINT "orders_refunded_by_fkey"
            FOREIGN KEY ("refunded_by") REFERENCES "users" ("id")
            ON DELETE SET NULL ON UPDATE CASCADE
        `)
        // Pending refunds are listed from the admin; there are few of them at any time.
        await queryRunner.query(
            `CREATE INDEX "orders_refund_pending_idx" ON "orders" ("created_at") WHERE "refund_status" = 'PENDIENTE'`,
        )

        await queryRunner.query(`
            ALTER TABLE "order_payments"
                ADD COLUMN "late" boolean NOT NULL DEFAULT false,
                ADD COLUMN "source" text NOT NULL DEFAULT 'customer',
                ADD COLUMN "recorded_by" text,
                ADD CONSTRAINT "order_payments_source_check"
                    CHECK ("source" IN ('customer', 'admin'))
        `)
        await queryRunner.query(`
            ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_recorded_by_fkey"
            FOREIGN KEY ("recorded_by") REFERENCES "users" ("id")
            ON DELETE SET NULL ON UPDATE CASCADE
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order_payments" DROP CONSTRAINT "order_payments_recorded_by_fkey"`,
        )
        await queryRunner.query(`
            ALTER TABLE "order_payments"
                DROP CONSTRAINT "order_payments_source_check",
                DROP COLUMN "recorded_by",
                DROP COLUMN "source",
                DROP COLUMN "late"
        `)
        await queryRunner.query(`DROP INDEX "orders_refund_pending_idx"`)
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "orders_refunded_by_fkey"`)
        await queryRunner.query(`
            ALTER TABLE "orders"
                DROP CONSTRAINT "orders_refund_status_check",
                DROP COLUMN "refunded_by",
                DROP COLUMN "refunded_at",
                DROP COLUMN "refund_reference",
                DROP COLUMN "refund_status",
                DROP COLUMN "stock_conflict",
                DROP COLUMN "late_payment"
        `)
    }
}
