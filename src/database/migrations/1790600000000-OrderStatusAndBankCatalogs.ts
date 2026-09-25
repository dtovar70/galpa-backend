import type { MigrationInterface, QueryRunner } from 'typeorm'

/** Admin tabs of the orders page, in tab order. `description` is the empty-tab text. */
const GROUPS = [
    [
        'POR_VERIFICAR',
        'Por verificar',
        'Cuando un cliente envíe su comprobante, aparecerá aquí.',
        true,
    ],
    ['POR_PAGAR', 'Por pagar', 'Aquí verás los pedidos sin pagar y los pagos rechazados.', false],
    ['EN_CURSO', 'En curso', 'Los pedidos pagados aparecen aquí hasta que se entregan.', false],
    [
        'CERRADOS',
        'Cerrados',
        'Los pedidos entregados, cancelados o expirados se guardan aquí.',
        false,
    ],
] as const

/**
 * Exactly the texts the admin and the customer order page showed before this migration:
 * code, admin label, customer timeline label, customer message title and body, group, badge
 * tone, terminal. The position is the index (the order of `ORDER_STATUSES`).
 */
const STATUSES = [
    [
        'PENDIENTE_PAGO',
        'Pendiente de pago',
        'Pedido creado',
        'Tu pedido está reservado',
        'Paga con Pago Móvil desde tu banco y envíanos el comprobante antes de que venza el plazo.',
        'POR_PAGAR',
        'butter',
        false,
    ],
    [
        'PENDIENTE_VERIFICACION',
        'Pendiente por verificación',
        'Pago enviado',
        'Recibimos tu pago, lo estamos verificando',
        'Te confirmamos en cuanto lo veamos en el banco. Esta página se actualiza sola.',
        'POR_VERIFICAR',
        'sky',
        false,
    ],
    [
        'PAGO_VERIFICADO',
        'Pago verificado',
        'Pago verificado',
        '¡Pago confirmado!',
        'Gracias. Muy pronto empezamos a preparar tu pedido en el taller.',
        'EN_CURSO',
        'mint',
        false,
    ],
    [
        'PAGO_RECHAZADO',
        'Pago rechazado',
        'Pago rechazado',
        'No pudimos confirmar tu pago',
        'Revisa el motivo y vuelve a enviar el comprobante con los datos correctos.',
        'POR_PAGAR',
        'blush',
        false,
    ],
    [
        'EN_PRODUCCION',
        'En producción',
        'En producción',
        'Estamos preparando tu pedido',
        'Lo estamos personalizando en el taller. {produccion}.',
        'EN_CURSO',
        'lilac',
        false,
    ],
    [
        'LISTO_PARA_ENTREGA',
        'Listo para entrega',
        'Listo para entrega',
        '¡Tu pedido está listo!',
        'Saldrá muy pronto hacia tu dirección.',
        'EN_CURSO',
        'mint',
        false,
    ],
    [
        'ENVIADO',
        'Enviado',
        'Enviado',
        'Tu pedido va en camino',
        'Te avisaremos si necesitamos algo para la entrega.',
        'EN_CURSO',
        'sky',
        false,
    ],
    [
        'ENTREGADO',
        'Entregado',
        'Entregado',
        '¡Pedido entregado!',
        'Gracias por comprar en {marca}. ¡Esperamos que lo disfrutes!',
        'CERRADOS',
        'mint',
        true,
    ],
    [
        'CANCELADO',
        'Cancelado',
        'Cancelado',
        'Este pedido fue cancelado',
        'Si hiciste un pago, escríbenos.',
        'CERRADOS',
        'neutral',
        true,
    ],
    [
        'EXPIRADO',
        'Expirado',
        'Expirado',
        'El plazo para pagar venció',
        'El plazo venció, pero si ya hiciste el pago súbelo aquí y lo verificaremos.',
        'CERRADOS',
        'neutral',
        true,
    ],
] as const

/** The list the API and the storefront shipped with, in select order. All active. */
const BANKS = [
    ['0102', 'Banco de Venezuela'],
    ['0104', 'Venezolano de Crédito'],
    ['0105', 'Mercantil'],
    ['0108', 'BBVA Provincial'],
    ['0114', 'Bancaribe'],
    ['0115', 'Banco Exterior'],
    ['0128', 'Banco Caroní'],
    ['0134', 'Banesco'],
    ['0137', 'Banco Sofitasa'],
    ['0138', 'Banco Plaza'],
    ['0146', 'Bangente'],
    ['0151', 'BFC Banco Fondo Común'],
    ['0156', '100% Banco'],
    ['0157', 'DelSur'],
    ['0163', 'Banco del Tesoro'],
    ['0166', 'Banco Agrícola de Venezuela'],
    ['0168', 'Bancrecer'],
    ['0169', 'R4 Banco Microfinanciero'],
    ['0171', 'Banco Activo'],
    ['0172', 'Bancamiga'],
    ['0173', 'Banco Internacional de Desarrollo'],
    ['0174', 'Banplus'],
    ['0175', 'Banco Digital de los Trabajadores'],
    ['0177', 'Banfanb'],
    ['0178', 'N58 Banco Digital'],
    ['0191', 'Banco Nacional de Crédito (BNC)'],
] as const

/** `($1, $2, …), ($n, …)` for `rows` rows of `columns` values each. */
function placeholders(rows: number, columns: number): string {
    return Array.from(
        { length: rows },
        (_, row) =>
            `(${Array.from({ length: columns }, (_, column) => `$${row * columns + column + 1}`).join(', ')})`,
    ).join(', ')
}

/**
 * Business catalogs move from code to the database: order status labels, customer copy, badge
 * tones and admin tabs (`order_status_groups`, `order_statuses`) and the Venezuelan banks
 * (`banks`). Status codes and transitions stay in code (`src/orders/order-status.ts`).
 *
 * - The seeds are exactly the texts shipped until now, so nothing visible changes.
 * - `orders.status` and `order_status_history.from_status` / `to_status` reference
 *   `order_statuses.code`, and `order_payments.payer_bank_code` references `banks.code`
 *   (`ON UPDATE CASCADE ON DELETE RESTRICT`). `orders_status_check` is kept: it pins the column
 *   to the codes the workflow knows, while the foreign key requires a catalog row for them.
 * - Those four columns change from `text` to the type of the key they reference
 *   (`varchar(40)` / `varchar(4)`); the values do not change.
 *
 * Existing data: every status and bank code already stored comes from the same lists (the old
 * CHECK and DTO), so the foreign keys validate. Otherwise `ADD CONSTRAINT` fails and the whole
 * migration rolls back.
 */
export class OrderStatusAndBankCatalogs1790600000000 implements MigrationInterface {
    name = 'OrderStatusAndBankCatalogs1790600000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "order_status_groups" (
                "code" varchar(40) NOT NULL,
                "label" varchar(100) NOT NULL,
                "description" varchar(300),
                "sort_order" integer NOT NULL DEFAULT 0,
                "highlight" boolean NOT NULL DEFAULT false,
                CONSTRAINT "order_status_groups_pkey" PRIMARY KEY ("code")
            )
        `)
        await queryRunner.query(`
            CREATE TABLE "order_statuses" (
                "code" varchar(40) NOT NULL,
                "label" varchar(100) NOT NULL,
                "customer_label" varchar(100) NOT NULL,
                "customer_title" varchar(100),
                "customer_description" varchar(300),
                "group_code" varchar(40) NOT NULL,
                "tone" varchar(20) NOT NULL,
                "sort_order" integer NOT NULL DEFAULT 0,
                "is_terminal" boolean NOT NULL DEFAULT false,
                CONSTRAINT "order_statuses_pkey" PRIMARY KEY ("code"),
                CONSTRAINT "order_statuses_tone_check"
                    CHECK ("tone" IN ('blush', 'sky', 'mint', 'butter', 'lilac', 'solid', 'neutral'))
            )
        `)
        await queryRunner.query(`
            ALTER TABLE "order_statuses" ADD CONSTRAINT "order_statuses_group_code_fkey"
            FOREIGN KEY ("group_code") REFERENCES "order_status_groups"("code")
            ON DELETE RESTRICT ON UPDATE CASCADE
        `)
        await queryRunner.query(`
            CREATE TABLE "banks" (
                "code" varchar(4) NOT NULL,
                "name" varchar(100) NOT NULL,
                "is_active" boolean NOT NULL DEFAULT true,
                "sort_order" integer NOT NULL DEFAULT 0,
                CONSTRAINT "banks_pkey" PRIMARY KEY ("code"),
                CONSTRAINT "banks_code_check" CHECK ("code" ~ '^[0-9]{4}$')
            )
        `)

        await queryRunner.query(
            `INSERT INTO "order_status_groups" ("code", "label", "description", "sort_order", "highlight")
             VALUES ${placeholders(GROUPS.length, 5)}`,
            GROUPS.flatMap(([code, label, description, highlight], index) => [
                code,
                label,
                description,
                index,
                highlight,
            ]),
        )
        await queryRunner.query(
            `INSERT INTO "order_statuses" ("code", "label", "customer_label", "customer_title",
                "customer_description", "group_code", "tone", "sort_order", "is_terminal")
             VALUES ${placeholders(STATUSES.length, 9)}`,
            STATUSES.flatMap((status, index) => {
                const [code, label, customerLabel, title, description, group, tone, terminal] =
                    status
                return [
                    code,
                    label,
                    customerLabel,
                    title,
                    description,
                    group,
                    tone,
                    index,
                    terminal,
                ]
            }),
        )
        await queryRunner.query(
            `INSERT INTO "banks" ("code", "name", "is_active", "sort_order")
             VALUES ${placeholders(BANKS.length, 4)}`,
            BANKS.flatMap(([code, name], index) => [code, name, true, index]),
        )

        // The referencing columns take the type of the keys (`text` -> `varchar`). Every stored
        // value is a known code, far below these lengths.
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" TYPE varchar(40)`)
        await queryRunner.query(`
            ALTER TABLE "order_status_history"
                ALTER COLUMN "from_status" TYPE varchar(40),
                ALTER COLUMN "to_status" TYPE varchar(40)
        `)
        await queryRunner.query(
            `ALTER TABLE "order_payments" ALTER COLUMN "payer_bank_code" TYPE varchar(4)`,
        )

        await queryRunner.query(`
            ALTER TABLE "orders" ADD CONSTRAINT "orders_status_fkey"
            FOREIGN KEY ("status") REFERENCES "order_statuses"("code")
            ON DELETE RESTRICT ON UPDATE CASCADE
        `)
        await queryRunner.query(`
            ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_from_status_fkey"
            FOREIGN KEY ("from_status") REFERENCES "order_statuses"("code")
            ON DELETE RESTRICT ON UPDATE CASCADE
        `)
        await queryRunner.query(`
            ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_to_status_fkey"
            FOREIGN KEY ("to_status") REFERENCES "order_statuses"("code")
            ON DELETE RESTRICT ON UPDATE CASCADE
        `)
        await queryRunner.query(`
            ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_payer_bank_code_fkey"
            FOREIGN KEY ("payer_bank_code") REFERENCES "banks"("code")
            ON DELETE RESTRICT ON UPDATE CASCADE
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "order_payments" DROP CONSTRAINT "order_payments_payer_bank_code_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_status_history" DROP CONSTRAINT "order_status_history_to_status_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_status_history" DROP CONSTRAINT "order_status_history_from_status_fkey"`,
        )
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "orders_status_fkey"`)
        await queryRunner.query(
            `ALTER TABLE "order_payments" ALTER COLUMN "payer_bank_code" TYPE text`,
        )
        await queryRunner.query(`
            ALTER TABLE "order_status_history"
                ALTER COLUMN "from_status" TYPE text,
                ALTER COLUMN "to_status" TYPE text
        `)
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" TYPE text`)
        await queryRunner.query(`DROP TABLE "banks"`)
        await queryRunner.query(`DROP TABLE "order_statuses"`)
        await queryRunner.query(`DROP TABLE "order_status_groups"`)
    }
}
