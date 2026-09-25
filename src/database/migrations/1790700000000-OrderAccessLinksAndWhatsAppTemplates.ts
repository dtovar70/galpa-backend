import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * The WhatsApp message of each status, as seeded (a copy, so later code changes never alter what
 * this migration writes). Same texts as `DEFAULT_WHATSAPP_TEMPLATES` today.
 */
const WHATSAPP_TEMPLATES: Readonly<Record<string, string>> = {
    PENDIENTE_PAGO:
        '¡Hola {nombre}! 🐾 Gracias por tu pedido {pedido} en {marca}. Te recordamos que el total es {total}. Puedes pagar por Pago Móvil y subir tu comprobante aquí: {enlace}',
    PENDIENTE_VERIFICACION:
        '¡Hola {nombre}! 🙌 Recibimos el comprobante de tu pedido {pedido} y lo estamos verificando. Te avisamos apenas lo confirmemos. Puedes ver el estado aquí: {enlace}',
    PAGO_VERIFICADO:
        '¡Hola {nombre}! ✅ Confirmamos tu pago del pedido {pedido}. Ya estamos preparando tu pieza. Tu comprobante: {comprobante} · Sigue tu pedido: {enlace}',
    PAGO_RECHAZADO:
        'Hola {nombre} 👋 Revisamos el pago de tu pedido {pedido} y no pudimos aprobarlo: {motivo}. Puedes subir un nuevo comprobante aquí: {enlace}',
    EN_PRODUCCION:
        '¡Hola {nombre}! 🎨 Tu pedido {pedido} ya está en el taller y lo estamos personalizando con mucho cariño. Síguelo aquí: {enlace}',
    LISTO_PARA_ENTREGA:
        '¡Hola {nombre}! 🎉 Tu pedido {pedido} está listo. Muy pronto coordinamos la entrega contigo. Detalles: {enlace}',
    ENVIADO:
        '¡Hola {nombre}! 🚚 Tu pedido {pedido} ya va en camino. Datos del envío: {envio}. Síguelo aquí: {enlace}',
    ENTREGADO:
        '¡Hola {nombre}! 💛 Tu pedido {pedido} ya fue entregado. Gracias por confiar en {marca}, ¡esperamos que lo disfrutes mucho! Tu comprobante: {comprobante}',
    CANCELADO:
        'Hola {nombre}. Te escribimos por tu pedido {pedido}: lo cancelamos ({motivo}). Si hiciste un pago o tienes alguna duda, respóndenos por aquí y lo resolvemos juntos.',
    EXPIRADO:
        'Hola {nombre} 👋 El plazo para pagar tu pedido {pedido} venció. Si ya hiciste el pago, súbelo aquí y lo verificamos: {enlace}',
}

/**
 * Customer communication ("Avisar por WhatsApp" and the purchase receipt):
 *
 * - `order_access_links`: several private links per order. Only the SHA-256 of a token is stored,
 *   so the admin can never rebuild the customer's link; to send one she issues a new link. Each
 *   order's current `orders.access_token_hash` becomes its first link (same hash, `created_at` =
 *   the order's), so every link already sent keeps working. `orders.access_token_hash` is then
 *   dropped: the links table is the only place a token is checked, and a second copy of the
 *   first hash could drift from it.
 * - `order_statuses.whatsapp_template`: the message of each status (text, 1–1000 characters,
 *   CHECK), seeded above; edited in Catálogos.
 *
 * `down()` puts `orders.access_token_hash` back with each order's oldest link (the checkout one)
 * and drops the links table: links issued by an admin stop working after a revert.
 */
export class OrderAccessLinksAndWhatsAppTemplates1790700000000 implements MigrationInterface {
    name = 'OrderAccessLinksAndWhatsAppTemplates1790700000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "order_access_links" (
                "id" text NOT NULL,
                "order_id" text NOT NULL,
                "token_hash" text NOT NULL,
                "created_by" text,
                "created_at" timestamptz(3) NOT NULL DEFAULT now(),
                "revoked_at" timestamptz(3),
                CONSTRAINT "order_access_links_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "order_access_links_token_hash_check"
                    CHECK ("token_hash" ~ '^[a-f0-9]{64}$')
            )
        `)
        await queryRunner.query(
            `CREATE UNIQUE INDEX "order_access_links_token_hash_key" ON "order_access_links" ("token_hash")`,
        )
        await queryRunner.query(
            `CREATE INDEX "order_access_links_order_id_idx" ON "order_access_links" ("order_id")`,
        )
        await queryRunner.query(`
            ALTER TABLE "order_access_links" ADD CONSTRAINT "order_access_links_order_id_fkey"
            FOREIGN KEY ("order_id") REFERENCES "orders"("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        `)
        await queryRunner.query(`
            ALTER TABLE "order_access_links" ADD CONSTRAINT "order_access_links_created_by_fkey"
            FOREIGN KEY ("created_by") REFERENCES "users"("id")
            ON DELETE SET NULL ON UPDATE CASCADE
        `)
        // Every existing link keeps working: its hash becomes the order's first link.
        await queryRunner.query(`
            INSERT INTO "order_access_links" ("id", "order_id", "token_hash", "created_by", "created_at")
            SELECT gen_random_uuid()::text, "id", "access_token_hash", NULL, "created_at"
            FROM "orders"
        `)
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "access_token_hash"`)

        await queryRunner.query(`ALTER TABLE "order_statuses" ADD COLUMN "whatsapp_template" text`)
        for (const [code, template] of Object.entries(WHATSAPP_TEMPLATES)) {
            await queryRunner.query(
                `UPDATE "order_statuses" SET "whatsapp_template" = $1 WHERE "code" = $2`,
                [template, code],
            )
        }
        // A status without a seeded template (none today) makes SET NOT NULL fail: rolled back.
        await queryRunner.query(`
            ALTER TABLE "order_statuses"
                ALTER COLUMN "whatsapp_template" SET NOT NULL,
                ADD CONSTRAINT "order_statuses_whatsapp_template_length_check"
                    CHECK (char_length("whatsapp_template") BETWEEN 1 AND 1000)
        `)
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "order_statuses"
                DROP CONSTRAINT "order_statuses_whatsapp_template_length_check",
                DROP COLUMN "whatsapp_template"
        `)

        await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "access_token_hash" text`)
        await queryRunner.query(`
            UPDATE "orders" o SET "access_token_hash" = first."token_hash"
            FROM (
                SELECT DISTINCT ON ("order_id") "order_id", "token_hash"
                FROM "order_access_links"
                ORDER BY "order_id", "created_at", "id"
            ) first
            WHERE first."order_id" = o."id"
        `)
        await queryRunner.query(
            `ALTER TABLE "orders" ALTER COLUMN "access_token_hash" SET NOT NULL`,
        )
        await queryRunner.query(`DROP TABLE "order_access_links"`)
    }
}
