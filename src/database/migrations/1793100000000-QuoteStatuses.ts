import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Quote statuses, in the order of `QUOTE_STATUSES` (the position is the index): code, admin
 * label, help text, badge tone, terminal. The labels and tones are the ones the back office
 * used to hard-code.
 */
const STATUSES = [
    [
        'BORRADOR',
        'Borrador',
        'La cotización está en preparación y el cliente todavía no la recibe. Puedes editarla, enviarla o eliminarla.',
        'neutral',
        false,
    ],
    [
        'ENVIADA',
        'Enviada',
        'El cliente ya recibió la cotización por correo o WhatsApp. Aún puedes ajustarla; vence si pasa su fecha de vigencia sin respuesta.',
        'info',
        false,
    ],
    [
        'ACEPTADA',
        'Aceptada',
        'El cliente aprobó la cotización. Ya no se edita: el siguiente paso es convertirla en pedido.',
        'brand',
        false,
    ],
    [
        'CONVERTIDA',
        'Convertida en pedido',
        'La cotización se convirtió en un pedido y queda cerrada. El seguimiento continúa en ese pedido.',
        'solid',
        true,
    ],
    [
        'RECHAZADA',
        'Rechazada',
        'El cliente no aceptó la cotización. Queda cerrada como registro, con el motivo si lo indicaste.',
        'danger',
        true,
    ],
    [
        'VENCIDA',
        'Vencida',
        'Pasó la fecha de vigencia sin respuesta del cliente. Puedes devolverla a borrador para actualizarla y enviarla de nuevo.',
        'warning',
        false,
    ],
] as const

/**
 * The `quote_statuses` catalog (label, help text and badge tone of each quote status), seeded
 * with the six codes of `QUOTE_STATUSES`, and the `quotes_status_fkey` foreign key that keeps
 * every quote on a known status.
 */
export class QuoteStatuses1793100000000 implements MigrationInterface {
    name = 'QuoteStatuses1793100000000'

    async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `CREATE TABLE "quote_statuses" ("code" text NOT NULL, "label" character varying(100) NOT NULL, "description" character varying(300) NOT NULL, "tone" character varying(20) NOT NULL, "sort_order" integer NOT NULL DEFAULT '0', "is_terminal" boolean NOT NULL DEFAULT false, "updated_at" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "quote_statuses_tone_check" CHECK ("tone" IN ('brand', 'warning', 'info', 'danger', 'outline', 'solid', 'neutral')), CONSTRAINT "quote_statuses_code_check" CHECK ("code" IN ('BORRADOR', 'ENVIADA', 'ACEPTADA', 'CONVERTIDA', 'RECHAZADA', 'VENCIDA')), CONSTRAINT "quote_statuses_pkey" PRIMARY KEY ("code"))`,
        )
        await queryRunner.query(
            `INSERT INTO "quote_statuses" ("code", "label", "description", "tone", "is_terminal", "sort_order")
             VALUES ${STATUSES.map((_, row) => `(${Array.from({ length: 6 }, (_, column) => `$${row * 6 + column + 1}`).join(', ')})`).join(', ')}`,
            STATUSES.flatMap((row, index) => [...row, index]),
        )
        await queryRunner.query(
            `ALTER TABLE "quotes" ADD CONSTRAINT "quotes_status_fkey" FOREIGN KEY ("status") REFERENCES "quote_statuses"("code") ON DELETE RESTRICT ON UPDATE CASCADE`,
        )
    }

    async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "quotes" DROP CONSTRAINT "quotes_status_fkey"`)
        await queryRunner.query(`DROP TABLE "quote_statuses"`)
    }
}
