import {
    BadRequestException,
    Injectable,
    NotFoundException,
    type ValidationPipe,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BanksService } from '../catalogs/banks.service.js'
import { createValidationPipe } from '../common/pipes/validation.pipe.js'
import type { AuthUser } from '../common/types/auth-user.js'
import { DEFAULT_SITE_CONTENT } from './content.defaults.js'
import {
    CONTENT_SECTIONS,
    isContentSection,
    type ContentSection,
    type PaymentContent,
    type SiteContent,
} from './content.types.js'
import { CONTENT_SECTION_DTOS } from './dto/index.js'
import { SiteContentEntry } from './entities/site-content.entity.js'

export function unknownSectionMessage(section: string): string {
    return `No existe la sección de contenido «${section}».`
}

/** One section as the admin sees it. Matches `AdminContentSection` in the front. */
export interface AdminContentSectionDto<K extends ContentSection = ContentSection> {
    section: K
    value: SiteContent[K]
    /** True when nothing is stored and the built-in texts are shown. */
    isDefault: boolean
    /** ISO 8601, null for defaults. */
    updatedAt: string | null
    updatedBy: { id: string; name: string } | null
}

export type AdminContentDto = { [K in ContentSection]: AdminContentSectionDto<K> }

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sameKind(stored: unknown, fallback: unknown): boolean {
    if (Array.isArray(fallback)) return Array.isArray(stored)
    return typeof stored === typeof fallback && stored !== null
}

/**
 * Stored values over the defaults, field by field. Unknown fields are dropped and fields of the
 * wrong kind fall back to the default, so an older or hand-edited row can never break the site.
 */
export function mergeSection<K extends ContentSection>(
    section: K,
    stored: unknown,
): SiteContent[K] {
    const defaults = DEFAULT_SITE_CONTENT[section]
    if (!isPlainObject(stored)) return structuredClone(defaults)

    const merged = structuredClone(defaults) as unknown as Record<string, unknown>
    for (const [field, fallback] of Object.entries(defaults)) {
        const value = stored[field]
        if (value !== undefined && sameKind(value, fallback)) merged[field] = value
    }
    return merged as unknown as SiteContent[K]
}

@Injectable()
export class ContentService {
    /** Same rules and Spanish error format as the global pipe, applied to the section's DTO. */
    private readonly validation: ValidationPipe = createValidationPipe()

    constructor(
        @InjectRepository(SiteContentEntry)
        private readonly entries: Repository<SiteContentEntry>,
        private readonly banks: BanksService,
    ) {}

    /** Every section, stored values merged over the defaults. */
    async getAll(): Promise<SiteContent> {
        const rows = await this.entries.find()
        const stored = new Map(rows.map((row) => [row.key, row.value]))
        return Object.fromEntries(
            CONTENT_SECTIONS.map((section) => [
                section,
                mergeSection(section, stored.get(section)),
            ]),
        ) as unknown as SiteContent
    }

    async getAllForAdmin(): Promise<AdminContentDto> {
        const rows = await this.entries.find({ relations: { updatedBy: true } })
        const bySection = new Map(rows.map((row) => [row.key, row]))
        return Object.fromEntries(
            CONTENT_SECTIONS.map((section) => [
                section,
                toAdminSection(section, bySection.get(section)),
            ]),
        ) as unknown as AdminContentDto
    }

    /** Replaces a whole section. `body` is validated against the section's DTO. */
    async update(section: string, body: unknown, user: AuthUser): Promise<AdminContentSectionDto> {
        const key = this.assertSection(section)
        const dto: object = await this.validation.transform(body, {
            type: 'body',
            metatype: CONTENT_SECTION_DTOS[key],
        })
        if (key === 'payment') await this.checkPaymentBank(dto as PaymentContent)

        // One atomic upsert: two admins saving at once can never collide on the primary key.
        await this.entries.query(
            `INSERT INTO "site_content" ("key", "value", "updated_at", "updated_by")
             VALUES ($1, $2::jsonb, now(), $3)
             ON CONFLICT ("key") DO UPDATE
             SET "value" = EXCLUDED."value", "updated_at" = now(), "updated_by" = EXCLUDED."updated_by"`,
            [key, JSON.stringify(dto), user.id],
        )
        const saved = await this.entries.findOne({
            where: { key },
            relations: { updatedBy: true },
        })
        return toAdminSection(key, saved ?? undefined)
    }

    /** Drops the stored value, so the section shows the built-in texts again. */
    async reset(section: string): Promise<AdminContentSectionDto> {
        const key = this.assertSection(section)
        await this.entries.delete({ key })
        return toAdminSection(key, undefined)
    }

    /**
     * The Pago Móvil bank must be an active bank of the `banks` catalog; its name is taken from
     * the catalog, so the details the customer copies always match the bank list.
     */
    private async checkPaymentBank(payment: PaymentContent): Promise<void> {
        const bank = await this.banks.findActive(payment.bankCode)
        if (!bank) {
            throw new BadRequestException({
                statusCode: 400,
                error: 'Bad Request',
                message: 'Los datos enviados no son válidos. Revisa los campos marcados.',
                details: [{ field: 'bankCode', errors: ['Elige un banco de la lista.'] }],
            })
        }
        payment.bankName = bank.name
    }

    private assertSection(section: string): ContentSection {
        if (!isContentSection(section)) throw new NotFoundException(unknownSectionMessage(section))
        return section
    }
}

function toAdminSection<K extends ContentSection>(
    section: K,
    row: SiteContentEntry | undefined,
): AdminContentSectionDto<K> {
    return {
        section,
        value: mergeSection(section, row?.value),
        isDefault: row === undefined,
        updatedAt: row ? row.updatedAt.toISOString() : null,
        updatedBy: row?.updatedBy ? { id: row.updatedBy.id, name: row.updatedBy.name } : null,
    }
}
