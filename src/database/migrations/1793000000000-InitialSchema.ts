import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Order status groups: admin tabs of the orders page, in tab order (code, label, empty-tab text,
 * highlighted counter).
 */
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
 * Order statuses, in the order of `ORDER_STATUSES` (the position is the index): code, admin
 * label, customer timeline label, customer message title and body, group, badge tone, terminal.
 * The WhatsApp templates are `DEFAULT_WHATSAPP_TEMPLATES` at the time of this migration.
 */
const STATUSES = [
    [
        'PENDIENTE_PAGO',
        'Pendiente de pago',
        'Esperando tu pago',
        'Tu pedido está reservado',
        'Realiza el pago con el método que elegiste y envíanos el comprobante antes de que venza el plazo.',
        'POR_PAGAR',
        'warning',
        false,
        '¡Hola {nombre}! Gracias por tu pedido {pedido} en {marca}. El total es {total} y elegiste pagar por {metodo}. Puedes pagar y subir tu comprobante aquí: {enlace}',
    ],
    [
        'PENDIENTE_VERIFICACION',
        'Comprobante por verificar',
        'Verificando tu pago',
        'Recibimos tu pago, lo estamos verificando',
        'Te confirmamos en cuanto lo veamos reflejado. Esta página se actualiza sola.',
        'POR_VERIFICAR',
        'info',
        false,
        '¡Hola {nombre}! Recibimos el comprobante de tu pedido {pedido} y lo estamos verificando. Te avisamos apenas lo confirmemos. Puedes ver el estado aquí: {enlace}',
    ],
    [
        'PAGO_VERIFICADO',
        'Pago aprobado',
        'Pago aprobado',
        '¡Pago aprobado!',
        'Gracias. Ya estamos trabajando en tu pedido y te avisaremos en cada paso.',
        'EN_CURSO',
        'brand',
        false,
        '¡Hola {nombre}! ✅ Confirmamos tu pago del pedido {pedido}. Ya estamos trabajando en él. Tu comprobante: {comprobante} · Sigue tu pedido: {enlace}',
    ],
    [
        'PAGO_RECHAZADO',
        'Pago rechazado',
        'Necesitamos revisar tu pago',
        'No pudimos confirmar tu pago',
        'Revisa el motivo y vuelve a enviar el comprobante con los datos correctos, o elige otro método de pago.',
        'POR_PAGAR',
        'danger',
        false,
        'Hola {nombre}. Revisamos el pago de tu pedido {pedido} y no pudimos aprobarlo: {motivo}. Puedes subir un nuevo comprobante aquí: {enlace}',
    ],
    [
        'ESPERANDO_MERCANCIA',
        'Esperando mercancía (bajo pedido)',
        'Tu equipo viene en camino a nuestro almacén',
        'Estamos esperando tu equipo',
        'Pedimos los productos bajo pedido a nuestro proveedor. Te avisaremos apenas lleguen a nuestro almacén.',
        'EN_CURSO',
        'warning',
        false,
        '¡Hola {nombre}! Tu equipo del pedido {pedido} viene en camino a nuestro almacén. Te avisamos apenas llegue. Síguelo aquí: {enlace}',
    ],
    [
        'EN_PREPARACION',
        'Preparando despacho',
        'Estamos preparando tu pedido',
        'Estamos preparando tu pedido',
        'Revisamos y embalamos tu pedido. {despacho}.',
        'EN_CURSO',
        'outline',
        false,
        '¡Hola {nombre}! Estamos preparando tu pedido {pedido}. Muy pronto te confirmamos la entrega. Detalles: {enlace}',
    ],
    [
        'LISTO_PARA_RETIRO',
        'Listo para retiro',
        'Listo para retirar en tienda',
        '¡Tu pedido está listo para retirar!',
        'Pasa por nuestra tienda con tu número de pedido y tu documento de identidad.',
        'EN_CURSO',
        'brand',
        false,
        '¡Hola {nombre}! Tu pedido {pedido} está listo para retirar en nuestra tienda. Trae tu número de pedido y tu cédula. Detalles: {enlace}',
    ],
    [
        'DESPACHADO',
        'Despachado',
        'Tu pedido va en camino',
        'Tu pedido va en camino',
        'Te avisaremos si necesitamos algo para la entrega.',
        'EN_CURSO',
        'info',
        false,
        '¡Hola {nombre}! 🚚 Tu pedido {pedido} ya va en camino. Datos del envío: {envio}. Síguelo aquí: {enlace}',
    ],
    [
        'ENTREGADO',
        'Entregado',
        'Entregado',
        '¡Pedido entregado!',
        'Gracias por comprar en {marca}. Conserva tu comprobante para la garantía.',
        'CERRADOS',
        'brand',
        true,
        '¡Hola {nombre}! Tu pedido {pedido} ya fue entregado. Gracias por confiar en {marca}. Si necesitas instalación o mantenimiento, escríbenos. Tu comprobante: {comprobante}',
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
        'Hola {nombre}. Te escribimos por tu pedido {pedido}: lo cancelamos ({motivo}). Si hiciste un pago o tienes alguna duda, respóndenos por aquí y lo resolvemos.',
    ],
    [
        'EXPIRADO',
        'Expirado',
        'Expirado',
        'El plazo para pagar venció',
        'No recibimos el pago a tiempo, pero si ya pagaste súbelo aquí y lo verificaremos.',
        'CERRADOS',
        'neutral',
        true,
        'Hola {nombre}. El plazo para pagar tu pedido {pedido} venció. Si ya hiciste el pago, súbelo aquí y lo verificamos: {enlace}',
    ],
] as const

/** Venezuelan banks (Pago Móvil and transfers), in select order. All active. */
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

/** Mobile operator codes, in select order, and whether they are offered (0426 starts inactive). */
const MOBILE_PREFIXES = [
    ['0412', true],
    ['0414', true],
    ['0416', true],
    ['0422', true],
    ['0424', true],
    ['0426', false],
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
 * The whole Galpa schema in one step (the database starts empty), matching the entities
 * exactly, plus what TypeORM cannot express from them:
 * - `max_text_array_item_length(text[])`, used by the `products_highlights_length_check` CHECK;
 * - `UNIQUE (lower(email))` on `users` (`users_email_lower_key`);
 * - the `order_code_seq` ("GP-000123") and `quote_code_seq` ("COT-000045") sequences;
 * - the reference data: order status groups and statuses (labels, customer copy, tones,
 *   WhatsApp templates), the Venezuelan banks and the mobile operator codes.
 *
 * The function and the sequences tolerate existing ones: `schema:drop` (`npm run db:reset`)
 * removes tables and types but leaves them behind.
 *
 * Demo data (admin, categories, products) is loaded by `npm run db:seed`.
 */
export class InitialSchema1793000000000 implements MigrationInterface {
    name = 'InitialSchema1793000000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE OR REPLACE FUNCTION "max_text_array_item_length"(items text[]) RETURNS integer
            LANGUAGE sql IMMUTABLE PARALLEL SAFE
            AS $$ SELECT coalesce(max(char_length(item)), 0) FROM unnest(items) AS item $$
        `)
        await queryRunner.query(`CREATE TYPE "public"."Role" AS ENUM('ADMIN', 'EDITOR')`)
        await queryRunner.query(
            `CREATE TABLE "users" ("id" text NOT NULL, "email" character varying(100) NOT NULL, "password_hash" text NOT NULL, "name" character varying(100) NOT NULL, "role" "public"."Role" NOT NULL DEFAULT 'ADMIN', "is_active" boolean NOT NULL DEFAULT true, "password_changed_at" TIMESTAMP(3) WITH TIME ZONE, "last_login_at" TIMESTAMP(3) WITH TIME ZONE, "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "users_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(`CREATE UNIQUE INDEX "users_email_key" ON "users" ("email")`)
        await queryRunner.query(
            `CREATE TABLE "password_reset_codes" ("id" text NOT NULL, "user_id" text NOT NULL, "code_hash" text NOT NULL, "channel" character varying(20) NOT NULL, "expires_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL, "attempts" integer NOT NULL DEFAULT '0', "used_at" TIMESTAMP(3) WITH TIME ZONE, "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), "requester_ip" character varying(64), CONSTRAINT "password_reset_codes_attempts_check" CHECK ("attempts" >= 0), CONSTRAINT "password_reset_codes_channel_check" CHECK ("channel" IN ('telegram', 'email')), CONSTRAINT "password_reset_codes_code_hash_check" CHECK ("code_hash" ~ '^[a-f0-9]{64}$'), CONSTRAINT "password_reset_codes_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE INDEX "password_reset_codes_user_id_created_at_idx" ON "password_reset_codes" ("user_id", "created_at")`,
        )
        await queryRunner.query(
            `CREATE TABLE "banks" ("code" character varying(4) NOT NULL, "name" character varying(100) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', CONSTRAINT "banks_code_check" CHECK ("code" ~ '^[0-9]{4}$'), CONSTRAINT "banks_pkey" PRIMARY KEY ("code"))`,
        )
        await queryRunner.query(
            `CREATE TABLE "mobile_prefixes" ("code" character varying(4) NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "sort_order" integer NOT NULL DEFAULT '0', CONSTRAINT "mobile_prefixes_code_check" CHECK ("code" ~ '^04[0-9]{2}$'), CONSTRAINT "mobile_prefixes_pkey" PRIMARY KEY ("code"))`,
        )
        await queryRunner.query(
            `CREATE TABLE "order_status_groups" ("code" character varying(40) NOT NULL, "label" character varying(100) NOT NULL, "description" character varying(300), "sort_order" integer NOT NULL DEFAULT '0', "highlight" boolean NOT NULL DEFAULT false, CONSTRAINT "order_status_groups_pkey" PRIMARY KEY ("code"))`,
        )
        await queryRunner.query(
            `CREATE TABLE "order_statuses" ("code" character varying(40) NOT NULL, "label" character varying(100) NOT NULL, "customer_label" character varying(100) NOT NULL, "customer_title" character varying(100), "customer_description" character varying(300), "group_code" character varying(40) NOT NULL, "tone" character varying(20) NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', "whatsapp_template" text NOT NULL, "is_terminal" boolean NOT NULL DEFAULT false, CONSTRAINT "order_statuses_whatsapp_template_length_check" CHECK (char_length("whatsapp_template") BETWEEN 1 AND 1000), CONSTRAINT "order_statuses_tone_check" CHECK ("tone" IN ('brand', 'warning', 'info', 'danger', 'outline', 'solid', 'neutral')), CONSTRAINT "order_statuses_pkey" PRIMARY KEY ("code"))`,
        )
        await queryRunner.query(
            `CREATE TABLE "product_images" ("id" text NOT NULL, "product_id" text NOT NULL, "url" text NOT NULL, "public_id" text NOT NULL, "alt" character varying(100), "sort_order" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "product_images_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE INDEX "product_images_product_id_idx" ON "product_images" ("product_id")`,
        )
        await queryRunner.query(
            `CREATE TABLE "product_variants" ("id" text NOT NULL, "product_id" text NOT NULL, "label" character varying(100) NOT NULL, "price_delta" numeric(10,2) NOT NULL DEFAULT '0', "sort_order" integer NOT NULL DEFAULT '0', "stock" integer NOT NULL DEFAULT '0', CONSTRAINT "product_variants_stock_check" CHECK ("stock" >= 0), CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE INDEX "product_variants_product_id_idx" ON "product_variants" ("product_id")`,
        )
        await queryRunner.query(
            `CREATE TABLE "products" ("id" text NOT NULL, "slug" character varying(100) NOT NULL, "name" character varying(100) NOT NULL, "category_slug" character varying(100) NOT NULL, "price" numeric(10,2) NOT NULL, "compare_at_price" numeric(10,2), "brand" character varying(100) NOT NULL, "model" character varying(100), "sku" character varying(100), "stock_mode" text NOT NULL DEFAULT 'STOCK', "lead_time_days" integer, "btu" integer, "voltage" character varying(100), "is_inverter" boolean, "refrigerant" character varying(100), "specs" jsonb NOT NULL DEFAULT '[]', "description" text NOT NULL, "highlights" text array NOT NULL DEFAULT '{}', "tags" text array NOT NULL DEFAULT '{}', "stock" integer NOT NULL DEFAULT '0', "is_active" boolean NOT NULL DEFAULT true, "search_text" text NOT NULL DEFAULT '', "relevance_score" double precision NOT NULL DEFAULT '0', "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "products_highlights_length_check" CHECK (max_text_array_item_length("highlights") <= 100), CONSTRAINT "products_highlights_count_check" CHECK (cardinality("highlights") <= 6), CONSTRAINT "products_description_length_check" CHECK (char_length("description") <= 4000), CONSTRAINT "products_specs_check" CHECK (jsonb_typeof("specs") = 'array' AND jsonb_array_length("specs") <= 30), CONSTRAINT "products_btu_check" CHECK ("btu" > 0), CONSTRAINT "products_lead_time_days_check" CHECK ("lead_time_days" >= 0), CONSTRAINT "products_stock_mode_check" CHECK ("stock_mode" IN ('STOCK', 'ON_ORDER')), CONSTRAINT "products_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "products_sku_key" ON "products" ("sku") WHERE "sku" IS NOT NULL`,
        )
        await queryRunner.query(`CREATE INDEX "products_brand_idx" ON "products" ("brand")`)
        await queryRunner.query(
            `CREATE INDEX "products_is_active_relevance_score_idx" ON "products" ("is_active", "relevance_score")`,
        )
        await queryRunner.query(
            `CREATE INDEX "products_category_slug_idx" ON "products" ("category_slug")`,
        )
        await queryRunner.query(`CREATE UNIQUE INDEX "products_slug_key" ON "products" ("slug")`)
        await queryRunner.query(
            `CREATE TABLE "categories" ("slug" character varying(100) NOT NULL, "name" character varying(100) NOT NULL, "tagline" character varying(100) NOT NULL, "description" text NOT NULL, "color_hex" character varying(100) NOT NULL, "icon" character varying(100), "sort_order" integer NOT NULL DEFAULT '0', CONSTRAINT "categories_description_length_check" CHECK (char_length("description") <= 1000), CONSTRAINT "categories_pkey" PRIMARY KEY ("slug"))`,
        )
        await queryRunner.query(
            `CREATE TABLE "site_content" ("key" text NOT NULL, "value" jsonb NOT NULL, "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), "updated_by" text, CONSTRAINT "site_content_pkey" PRIMARY KEY ("key"))`,
        )
        await queryRunner.query(
            `CREATE TABLE "exchange_rates" ("id" text NOT NULL, "rate" numeric(12,4) NOT NULL, "source" text NOT NULL, "effective_date" date NOT NULL, "fetched_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL, "is_manual" boolean NOT NULL DEFAULT false, "created_by" text, CONSTRAINT "exchange_rates_source_check" CHECK ("source" IN ('bcv', 'dolarapi', 'manual')), CONSTRAINT "exchange_rates_rate_check" CHECK ("rate" > 0), CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE INDEX "exchange_rates_fetched_at_idx" ON "exchange_rates" ("fetched_at")`,
        )
        await queryRunner.query(
            `CREATE TABLE "order_items" ("id" text NOT NULL, "order_id" text NOT NULL, "product_id" text, "variant_id" text, "product_name" text NOT NULL, "product_slug" text, "brand" text, "model" text, "stock_mode" text NOT NULL DEFAULT 'STOCK', "variant_label" text, "image_url" text, "unit_price_usd" numeric(10,2) NOT NULL, "quantity" integer NOT NULL, "line_total_usd" numeric(10,2) NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', CONSTRAINT "order_items_stock_mode_check" CHECK ("stock_mode" IN ('STOCK', 'ON_ORDER')), CONSTRAINT "order_items_quantity_check" CHECK ("quantity" > 0), CONSTRAINT "order_items_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE INDEX "order_items_order_id_idx" ON "order_items" ("order_id")`,
        )
        await queryRunner.query(
            `CREATE TABLE "order_notes" ("id" text NOT NULL, "order_id" text NOT NULL, "author_id" text, "body" text NOT NULL, "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "order_notes_body_length_check" CHECK (char_length("body") <= 1000), CONSTRAINT "order_notes_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE INDEX "order_notes_order_id_idx" ON "order_notes" ("order_id")`,
        )
        await queryRunner.query(
            `CREATE TABLE "order_payments" ("id" text NOT NULL, "order_id" text NOT NULL, "status" text NOT NULL DEFAULT 'PENDIENTE', "method" text NOT NULL, "reference" character varying(100) NOT NULL, "payer_bank_code" character varying(4), "payer_bank_name" text, "payer_phone" character varying(100), "payer_id_number" character varying(100), "payer_name" character varying(100), "payer_account" character varying(100), "paid_on" date NOT NULL, "amount_bs" numeric(14,2), "expected_bs" numeric(14,2), "amount_usd" numeric(10,2), "expected_usd" numeric(10,2), "duplicate_reference" boolean NOT NULL DEFAULT false, "proof_key" text, "has_proof" boolean NOT NULL DEFAULT false, "late" boolean NOT NULL DEFAULT false, "source" text NOT NULL DEFAULT 'customer', "recorded_by" text, "rejection_reason" text, "reviewed_at" TIMESTAMP(3) WITH TIME ZONE, "reviewed_by" text, "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "order_payments_rejection_reason_length_check" CHECK (char_length("rejection_reason") <= 500), CONSTRAINT "order_payments_source_check" CHECK ("source" IN ('customer', 'admin')), CONSTRAINT "order_payments_amounts_check" CHECK (("method" IN ('PAGO_MOVIL', 'TRANSFERENCIA') AND "amount_bs" IS NOT NULL AND "expected_bs" IS NOT NULL) OR ("method" IN ('ZELLE', 'BINANCE') AND "amount_usd" IS NOT NULL AND "expected_usd" IS NOT NULL)), CONSTRAINT "order_payments_method_check" CHECK ("method" IN ('PAGO_MOVIL', 'TRANSFERENCIA', 'ZELLE', 'BINANCE')), CONSTRAINT "order_payments_status_check" CHECK ("status" IN ('PENDIENTE', 'VERIFICADO', 'RECHAZADO')), CONSTRAINT "order_payments_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE INDEX "order_payments_method_reference_idx" ON "order_payments" ("method", "reference")`,
        )
        await queryRunner.query(
            `CREATE INDEX "order_payments_order_id_idx" ON "order_payments" ("order_id")`,
        )
        await queryRunner.query(
            `CREATE TABLE "order_status_history" ("id" text NOT NULL, "order_id" text NOT NULL, "from_status" character varying(40), "to_status" character varying(40) NOT NULL, "actor_type" text NOT NULL, "actor_user_id" text, "note" text, "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "order_status_history_actor_type_check" CHECK ("actor_type" IN ('admin', 'customer', 'system', 'telegram')), CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE INDEX "order_status_history_order_id_idx" ON "order_status_history" ("order_id")`,
        )
        await queryRunner.query(
            `CREATE TABLE "orders" ("id" text NOT NULL, "code" text NOT NULL, "status" character varying(40) NOT NULL, "customer_name" character varying(100) NOT NULL, "customer_email" character varying(100) NOT NULL, "customer_phone" character varying(100) NOT NULL, "customer_id_number" character varying(100), "city" character varying(100) NOT NULL, "address" character varying(100) NOT NULL, "delivery_method" text NOT NULL, "notes" text NOT NULL DEFAULT '', "payment_method" text NOT NULL, "has_on_order_items" boolean NOT NULL DEFAULT false, "wants_installation" boolean NOT NULL DEFAULT false, "subtotal_usd" numeric(10,2) NOT NULL, "discount_usd" numeric(10,2) NOT NULL, "shipping_usd" numeric(10,2) NOT NULL, "total_usd" numeric(10,2) NOT NULL, "exchange_rate" numeric(12,4) NOT NULL, "exchange_rate_source" text NOT NULL, "exchange_rate_date" date NOT NULL, "exchange_rate_id" text, "total_bs" numeric(14,2) NOT NULL, "payment_due_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL, "stock_restored" boolean NOT NULL DEFAULT false, "late_payment" boolean NOT NULL DEFAULT false, "stock_conflict" jsonb, "refund_status" text, "refund_reference" character varying(100), "refunded_at" TIMESTAMP(3) WITH TIME ZONE, "refunded_by" text, "idempotency_key" character varying(64), "idempotency_hash" character varying(64), "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "orders_refund_status_check" CHECK ("refund_status" IN ('NO_APLICA', 'PENDIENTE', 'REEMBOLSADO')), CONSTRAINT "orders_notes_length_check" CHECK (char_length("notes") <= 300), CONSTRAINT "orders_discount_usd_check" CHECK ("discount_usd" >= 0), CONSTRAINT "orders_payment_method_check" CHECK ("payment_method" IN ('PAGO_MOVIL', 'TRANSFERENCIA', 'ZELLE', 'BINANCE')), CONSTRAINT "orders_delivery_method_check" CHECK ("delivery_method" IN ('delivery', 'pickup')), CONSTRAINT "orders_status_check" CHECK ("status" IN ('PENDIENTE_PAGO', 'PENDIENTE_VERIFICACION', 'PAGO_VERIFICADO', 'PAGO_RECHAZADO', 'ESPERANDO_MERCANCIA', 'EN_PREPARACION', 'LISTO_PARA_RETIRO', 'DESPACHADO', 'ENTREGADO', 'CANCELADO', 'EXPIRADO')), CONSTRAINT "orders_idempotency_check" CHECK (("idempotency_key" IS NULL) = ("idempotency_hash" IS NULL)), CONSTRAINT "orders_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders" ("idempotency_key")`,
        )
        await queryRunner.query(
            `CREATE INDEX "orders_refund_pending_idx" ON "orders" ("created_at") WHERE "refund_status" = 'PENDIENTE'`,
        )
        await queryRunner.query(`CREATE INDEX "orders_created_at_idx" ON "orders" ("created_at")`)
        await queryRunner.query(`CREATE INDEX "orders_status_idx" ON "orders" ("status")`)
        await queryRunner.query(`CREATE UNIQUE INDEX "orders_code_key" ON "orders" ("code")`)
        await queryRunner.query(
            `CREATE TABLE "order_access_links" ("id" text NOT NULL, "order_id" text NOT NULL, "token_hash" text NOT NULL, "created_by" text, "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), "revoked_at" TIMESTAMP(3) WITH TIME ZONE, CONSTRAINT "order_access_links_token_hash_check" CHECK ("token_hash" ~ '^[a-f0-9]{64}$'), CONSTRAINT "order_access_links_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE INDEX "order_access_links_order_id_idx" ON "order_access_links" ("order_id")`,
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "order_access_links_token_hash_key" ON "order_access_links" ("token_hash")`,
        )
        await queryRunner.query(
            `CREATE TABLE "quote_items" ("id" text NOT NULL, "quote_id" text NOT NULL, "product_id" text, "variant_id" text, "product_slug" text, "description" text NOT NULL, "brand" character varying(100), "model" character varying(100), "quantity" integer NOT NULL, "unit_price_usd" numeric(10,2) NOT NULL, "line_total_usd" numeric(12,2) NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', CONSTRAINT "quote_items_description_length_check" CHECK (char_length("description") <= 300), CONSTRAINT "quote_items_unit_price_usd_check" CHECK ("unit_price_usd" >= 0), CONSTRAINT "quote_items_quantity_check" CHECK ("quantity" > 0), CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE INDEX "quote_items_quote_id_idx" ON "quote_items" ("quote_id")`,
        )
        await queryRunner.query(
            `CREATE TABLE "quotes" ("id" text NOT NULL, "code" text NOT NULL, "status" text NOT NULL DEFAULT 'BORRADOR', "status_reason" text, "customer_name" character varying(100) NOT NULL, "customer_email" character varying(100), "customer_phone" character varying(100), "customer_id_number" character varying(100), "customer_company" character varying(100), "notes" text NOT NULL DEFAULT '', "terms" text NOT NULL DEFAULT '', "valid_until" date NOT NULL, "subtotal_usd" numeric(10,2) NOT NULL, "discount_usd" numeric(10,2) NOT NULL DEFAULT '0', "total_usd" numeric(10,2) NOT NULL, "exchange_rate" numeric(12,4), "total_bs" numeric(14,2), "created_by" text, "sent_at" TIMESTAMP(3) WITH TIME ZONE, "converted_order_id" text, "converted_order_code" text, "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "quotes_discount_usd_check" CHECK ("discount_usd" >= 0), CONSTRAINT "quotes_terms_length_check" CHECK (char_length("terms") <= 2000), CONSTRAINT "quotes_notes_length_check" CHECK (char_length("notes") <= 1000), CONSTRAINT "quotes_status_check" CHECK ("status" IN ('BORRADOR', 'ENVIADA', 'ACEPTADA', 'CONVERTIDA', 'RECHAZADA', 'VENCIDA')), CONSTRAINT "quotes_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(`CREATE INDEX "quotes_created_at_idx" ON "quotes" ("created_at")`)
        await queryRunner.query(`CREATE INDEX "quotes_status_idx" ON "quotes" ("status")`)
        await queryRunner.query(`CREATE UNIQUE INDEX "quotes_code_key" ON "quotes" ("code")`)
        await queryRunner.query(
            `CREATE TABLE "quote_access_links" ("id" text NOT NULL, "quote_id" text NOT NULL, "token_hash" text NOT NULL, "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "quote_access_links_token_hash_check" CHECK ("token_hash" ~ '^[a-f0-9]{64}$'), CONSTRAINT "quote_access_links_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE INDEX "quote_access_links_quote_id_idx" ON "quote_access_links" ("quote_id")`,
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "quote_access_links_token_hash_key" ON "quote_access_links" ("token_hash")`,
        )
        await queryRunner.query(
            `CREATE TABLE "telegram_chats" ("id" text NOT NULL, "chat_id" bigint NOT NULL, "username" character varying(100), "first_name" character varying(100), "linked_by_user_id" text, "is_active" boolean NOT NULL DEFAULT true, "notify_new_orders" boolean NOT NULL DEFAULT false, "linked_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), "last_seen_at" TIMESTAMP(3) WITH TIME ZONE, CONSTRAINT "telegram_chats_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "telegram_chats_chat_id_key" ON "telegram_chats" ("chat_id")`,
        )
        await queryRunner.query(
            `CREATE TABLE "telegram_link_codes" ("id" text NOT NULL, "code_hash" text NOT NULL, "created_by_user_id" text NOT NULL, "expires_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP(3) WITH TIME ZONE, "used_by_chat_id" bigint, "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "telegram_link_codes_code_hash_check" CHECK ("code_hash" ~ '^[a-f0-9]{64}$'), CONSTRAINT "telegram_link_codes_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE INDEX "telegram_link_codes_code_hash_idx" ON "telegram_link_codes" ("code_hash")`,
        )
        await queryRunner.query(
            `CREATE TABLE "telegram_messages" ("id" text NOT NULL, "chat_id" bigint NOT NULL, "message_id" integer NOT NULL, "order_id" text NOT NULL, "payment_id" text, "kind" text NOT NULL, "resolution" text, "created_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "telegram_messages_kind_check" CHECK ("kind" IN ('payment', 'payment_caption', 'payment_photo', 'new_order', 'prompt')), CONSTRAINT "telegram_messages_pkey" PRIMARY KEY ("id"))`,
        )
        await queryRunner.query(
            `CREATE UNIQUE INDEX "telegram_messages_chat_message_key" ON "telegram_messages" ("chat_id", "message_id")`,
        )
        await queryRunner.query(
            `CREATE INDEX "telegram_messages_payment_id_idx" ON "telegram_messages" ("payment_id")`,
        )
        await queryRunner.query(
            `CREATE INDEX "telegram_messages_order_id_idx" ON "telegram_messages" ("order_id")`,
        )
        await queryRunner.query(
            `ALTER TABLE "password_reset_codes" ADD CONSTRAINT "password_reset_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_statuses" ADD CONSTRAINT "order_statuses_group_code_fkey" FOREIGN KEY ("group_code") REFERENCES "order_status_groups"("code") ON DELETE RESTRICT ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "products" ADD CONSTRAINT "products_category_slug_fkey" FOREIGN KEY ("category_slug") REFERENCES "categories"("slug") ON DELETE RESTRICT ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "site_content" ADD CONSTRAINT "site_content_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_payer_bank_code_fkey" FOREIGN KEY ("payer_bank_code") REFERENCES "banks"("code") ON DELETE RESTRICT ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_from_status_fkey" FOREIGN KEY ("from_status") REFERENCES "order_statuses"("code") ON DELETE RESTRICT ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_to_status_fkey" FOREIGN KEY ("to_status") REFERENCES "order_statuses"("code") ON DELETE RESTRICT ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "orders_status_fkey" FOREIGN KEY ("status") REFERENCES "order_statuses"("code") ON DELETE RESTRICT ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "orders_exchange_rate_id_fkey" FOREIGN KEY ("exchange_rate_id") REFERENCES "exchange_rates"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "orders" ADD CONSTRAINT "orders_refunded_by_fkey" FOREIGN KEY ("refunded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_access_links" ADD CONSTRAINT "order_access_links_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_access_links" ADD CONSTRAINT "order_access_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "quotes" ADD CONSTRAINT "quotes_converted_order_id_fkey" FOREIGN KEY ("converted_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "quote_access_links" ADD CONSTRAINT "quote_access_links_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_linked_by_user_id_fkey" FOREIGN KEY ("linked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "telegram_chats"("chat_id") ON DELETE CASCADE ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        )
        await queryRunner.query(
            `ALTER TABLE "telegram_messages" ADD CONSTRAINT "telegram_messages_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "order_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
        )

        await queryRunner.query(
            `CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (lower("email"))`,
        )
        await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "order_code_seq" AS integer START 1`)
        await queryRunner.query(`CREATE SEQUENCE IF NOT EXISTS "quote_code_seq" AS integer START 1`)

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
            `INSERT INTO "order_statuses" ("code", "label", "customer_label", "customer_title", "customer_description", "group_code", "tone", "is_terminal", "whatsapp_template", "sort_order")
             VALUES ${placeholders(STATUSES.length, 10)}`,
            STATUSES.flatMap((row, index) => [...row, index]),
        )
        await queryRunner.query(
            `INSERT INTO "banks" ("code", "name", "is_active", "sort_order")
             VALUES ${placeholders(BANKS.length, 4)}`,
            BANKS.flatMap(([code, name], index) => [code, name, true, index]),
        )
        await queryRunner.query(
            `INSERT INTO "mobile_prefixes" ("code", "is_active", "sort_order")
             VALUES ${placeholders(MOBILE_PREFIXES.length, 3)}`,
            MOBILE_PREFIXES.flatMap(([code, isActive], index) => [code, isActive, index]),
        )
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP SEQUENCE "quote_code_seq"`)
        await queryRunner.query(`DROP SEQUENCE "order_code_seq"`)
        await queryRunner.query(`DROP INDEX "users_email_lower_key"`)
        await queryRunner.query(
            `ALTER TABLE "telegram_messages" DROP CONSTRAINT "telegram_messages_payment_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "telegram_messages" DROP CONSTRAINT "telegram_messages_order_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "telegram_messages" DROP CONSTRAINT "telegram_messages_chat_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "telegram_link_codes" DROP CONSTRAINT "telegram_link_codes_created_by_user_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "telegram_chats" DROP CONSTRAINT "telegram_chats_linked_by_user_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "quote_access_links" DROP CONSTRAINT "quote_access_links_quote_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "quotes" DROP CONSTRAINT "quotes_converted_order_id_fkey"`,
        )
        await queryRunner.query(`ALTER TABLE "quotes" DROP CONSTRAINT "quotes_created_by_fkey"`)
        await queryRunner.query(
            `ALTER TABLE "quote_items" DROP CONSTRAINT "quote_items_product_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "quote_items" DROP CONSTRAINT "quote_items_quote_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_access_links" DROP CONSTRAINT "order_access_links_created_by_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_access_links" DROP CONSTRAINT "order_access_links_order_id_fkey"`,
        )
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "orders_refunded_by_fkey"`)
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT "orders_exchange_rate_id_fkey"`,
        )
        await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "orders_status_fkey"`)
        await queryRunner.query(
            `ALTER TABLE "order_status_history" DROP CONSTRAINT "order_status_history_actor_user_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_status_history" DROP CONSTRAINT "order_status_history_to_status_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_status_history" DROP CONSTRAINT "order_status_history_from_status_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_status_history" DROP CONSTRAINT "order_status_history_order_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_payments" DROP CONSTRAINT "order_payments_reviewed_by_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_payments" DROP CONSTRAINT "order_payments_recorded_by_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_payments" DROP CONSTRAINT "order_payments_payer_bank_code_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_payments" DROP CONSTRAINT "order_payments_order_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_notes" DROP CONSTRAINT "order_notes_author_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_notes" DROP CONSTRAINT "order_notes_order_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_items" DROP CONSTRAINT "order_items_product_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_items" DROP CONSTRAINT "order_items_order_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "exchange_rates" DROP CONSTRAINT "exchange_rates_created_by_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "site_content" DROP CONSTRAINT "site_content_updated_by_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "products" DROP CONSTRAINT "products_category_slug_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "product_variants" DROP CONSTRAINT "product_variants_product_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "product_images" DROP CONSTRAINT "product_images_product_id_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "order_statuses" DROP CONSTRAINT "order_statuses_group_code_fkey"`,
        )
        await queryRunner.query(
            `ALTER TABLE "password_reset_codes" DROP CONSTRAINT "password_reset_codes_user_id_fkey"`,
        )
        await queryRunner.query(`DROP INDEX "public"."telegram_messages_order_id_idx"`)
        await queryRunner.query(`DROP INDEX "public"."telegram_messages_payment_id_idx"`)
        await queryRunner.query(`DROP INDEX "public"."telegram_messages_chat_message_key"`)
        await queryRunner.query(`DROP TABLE "telegram_messages"`)
        await queryRunner.query(`DROP INDEX "public"."telegram_link_codes_code_hash_idx"`)
        await queryRunner.query(`DROP TABLE "telegram_link_codes"`)
        await queryRunner.query(`DROP INDEX "public"."telegram_chats_chat_id_key"`)
        await queryRunner.query(`DROP TABLE "telegram_chats"`)
        await queryRunner.query(`DROP INDEX "public"."quote_access_links_token_hash_key"`)
        await queryRunner.query(`DROP INDEX "public"."quote_access_links_quote_id_idx"`)
        await queryRunner.query(`DROP TABLE "quote_access_links"`)
        await queryRunner.query(`DROP INDEX "public"."quotes_code_key"`)
        await queryRunner.query(`DROP INDEX "public"."quotes_status_idx"`)
        await queryRunner.query(`DROP INDEX "public"."quotes_created_at_idx"`)
        await queryRunner.query(`DROP TABLE "quotes"`)
        await queryRunner.query(`DROP INDEX "public"."quote_items_quote_id_idx"`)
        await queryRunner.query(`DROP TABLE "quote_items"`)
        await queryRunner.query(`DROP INDEX "public"."order_access_links_token_hash_key"`)
        await queryRunner.query(`DROP INDEX "public"."order_access_links_order_id_idx"`)
        await queryRunner.query(`DROP TABLE "order_access_links"`)
        await queryRunner.query(`DROP INDEX "public"."orders_code_key"`)
        await queryRunner.query(`DROP INDEX "public"."orders_status_idx"`)
        await queryRunner.query(`DROP INDEX "public"."orders_created_at_idx"`)
        await queryRunner.query(`DROP INDEX "public"."orders_refund_pending_idx"`)
        await queryRunner.query(`DROP INDEX "public"."orders_idempotency_key_key"`)
        await queryRunner.query(`DROP TABLE "orders"`)
        await queryRunner.query(`DROP INDEX "public"."order_status_history_order_id_idx"`)
        await queryRunner.query(`DROP TABLE "order_status_history"`)
        await queryRunner.query(`DROP INDEX "public"."order_payments_order_id_idx"`)
        await queryRunner.query(`DROP INDEX "public"."order_payments_method_reference_idx"`)
        await queryRunner.query(`DROP TABLE "order_payments"`)
        await queryRunner.query(`DROP INDEX "public"."order_notes_order_id_idx"`)
        await queryRunner.query(`DROP TABLE "order_notes"`)
        await queryRunner.query(`DROP INDEX "public"."order_items_order_id_idx"`)
        await queryRunner.query(`DROP TABLE "order_items"`)
        await queryRunner.query(`DROP INDEX "public"."exchange_rates_fetched_at_idx"`)
        await queryRunner.query(`DROP TABLE "exchange_rates"`)
        await queryRunner.query(`DROP TABLE "site_content"`)
        await queryRunner.query(`DROP TABLE "categories"`)
        await queryRunner.query(`DROP INDEX "public"."products_slug_key"`)
        await queryRunner.query(`DROP INDEX "public"."products_category_slug_idx"`)
        await queryRunner.query(`DROP INDEX "public"."products_is_active_relevance_score_idx"`)
        await queryRunner.query(`DROP INDEX "public"."products_brand_idx"`)
        await queryRunner.query(`DROP INDEX "public"."products_sku_key"`)
        await queryRunner.query(`DROP TABLE "products"`)
        await queryRunner.query(`DROP INDEX "public"."product_variants_product_id_idx"`)
        await queryRunner.query(`DROP TABLE "product_variants"`)
        await queryRunner.query(`DROP INDEX "public"."product_images_product_id_idx"`)
        await queryRunner.query(`DROP TABLE "product_images"`)
        await queryRunner.query(`DROP TABLE "order_statuses"`)
        await queryRunner.query(`DROP TABLE "order_status_groups"`)
        await queryRunner.query(`DROP TABLE "mobile_prefixes"`)
        await queryRunner.query(`DROP TABLE "banks"`)
        await queryRunner.query(`DROP INDEX "public"."password_reset_codes_user_id_created_at_idx"`)
        await queryRunner.query(`DROP TABLE "password_reset_codes"`)
        await queryRunner.query(`DROP INDEX "public"."users_email_key"`)
        await queryRunner.query(`DROP TABLE "users"`)
        await queryRunner.query(`DROP TYPE "public"."Role"`)

        await queryRunner.query(`DROP FUNCTION "max_text_array_item_length"(text[])`)
    }
}
