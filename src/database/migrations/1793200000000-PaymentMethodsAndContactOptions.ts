import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Payment methods, in checkout order (the position is the index): code, name, checkout help
 * text, icon. The names, texts and icons are the ones the storefront used to hard-code.
 */
const PAYMENT_METHODS = [
    ['PAGO_MOVIL', 'Pago Móvil', 'En bolívares, a la tasa BCV del día.', 'smartphone'],
    ['TRANSFERENCIA', 'Transferencia bancaria', 'En bolívares, a la tasa BCV del día.', 'building'],
    ['ZELLE', 'Zelle', 'En dólares, desde tu cuenta en EE. UU.', 'dollar-sign'],
    ['BINANCE', 'Binance Pay', 'En dólares (USDT) con Binance Pay.', 'bitcoin'],
] as const

/** Topics of the contact form, in form order, with the labels the storefront showed. */
const CONTACT_TOPICS = [
    ['ASESORIA', 'Quiero asesoría para elegir un equipo'],
    ['COTIZACION', 'Necesito una cotización'],
    ['SOPORTE', 'Soporte, repuestos o garantía'],
    ['OTRO', 'Otro tema'],
] as const

/** Kinds of space of the advisory form, in form order. */
const SPACE_TYPES = [
    ['RESIDENCIAL', 'Residencial (hogar)'],
    ['COMERCIAL', 'Comercial (oficina, local, industria)'],
] as const

/** "($1, $2, $3), ($4, $5, $6)" for `rows` rows of `columns` parameters each. */
function placeholders(rows: number, columns: number): string {
    return Array.from(
        { length: rows },
        (_, row) =>
            `(${Array.from({ length: columns }, (_, column) => `$${row * columns + column + 1}`).join(', ')})`,
    ).join(', ')
}

/**
 * The `payment_methods` catalog (name, help text, icon and order of each payment method), seeded
 * with the four codes of `PAYMENT_METHODS`, the foreign keys that keep every order and payment on
 * a known method, and the `contact_topics` / `space_types` options of the contact form.
 */
export class PaymentMethodsAndContactOptions1793200000000 implements MigrationInterface {
    name = 'PaymentMethodsAndContactOptions1793200000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "payment_methods" ("code" text NOT NULL, "label" character varying(100) NOT NULL, "description" character varying(300) NOT NULL, "icon" character varying(30) NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "payment_methods_icon_check" CHECK ("icon" IN ('smartphone', 'building', 'landmark', 'dollar-sign', 'bitcoin', 'wallet', 'credit-card', 'banknote')), CONSTRAINT "payment_methods_code_check" CHECK ("code" IN ('PAGO_MOVIL', 'TRANSFERENCIA', 'ZELLE', 'BINANCE')), CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("code"))`,
        )
        await queryRunner.query(
            `INSERT INTO "payment_methods" ("code", "label", "description", "icon", "sort_order")
             VALUES ${placeholders(PAYMENT_METHODS.length, 5)}`,
            PAYMENT_METHODS.flatMap((row, index) => [...row, index]),
        )
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_fkey" FOREIGN KEY ("payment_method") REFERENCES "payment_methods"("code") ON DELETE RESTRICT ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_method_fkey" FOREIGN KEY ("method") REFERENCES "payment_methods"("code") ON DELETE RESTRICT ON UPDATE CASCADE`,
        )

        for (const [table, rows] of [
            ['contact_topics', CONTACT_TOPICS],
            ['space_types', SPACE_TYPES],
        ] as const) {
            await queryRunner.query(
                `CREATE TABLE "${table}" ("code" character varying(40) NOT NULL, "label" character varying(100) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "${table}_code_check" CHECK ("code" ~ '^[A-Z0-9]+(_[A-Z0-9]+)*$'), CONSTRAINT "${table}_pkey" PRIMARY KEY ("code"))`,
            )
            await queryRunner.query(
                `INSERT INTO "${table}" ("code", "label", "sort_order")
                 VALUES ${placeholders(rows.length, 3)}`,
                rows.flatMap((row, index) => [...row, index]),
            )
        }
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "space_types"`)
        await queryRunner.query(`DROP TABLE "contact_topics"`)
        await queryRunner.query(
            `ALTER TABLE "order_payments" DROP CONSTRAINT "order_payments_method_fkey"`,
        )
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "orders_payment_method_fkey"`)
        await queryRunner.query(`DROP TABLE "payment_methods"`)
    }
}
