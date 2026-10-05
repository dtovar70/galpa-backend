import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, type Repository } from 'typeorm'
import { isDbError, omitUndefined } from '../database/db-errors.js'
import type { CreateContactOptionDto, UpdateContactOptionDto } from './dto/contact-option.dto.js'
import { CONTACT_OPTION_CODE_MAX_LENGTH, CONTACT_OPTIONS_MAX } from './dto/field-names.js'
import { ContactTopicOption, SpaceTypeOption } from './entities/contact-option.entity.js'

/** Sub-route used to reorder a list ("order" is never a generated code: codes are uppercase). */
export const CONTACT_OPTION_ORDER_ROUTE = 'order'

/** Same rule as the `contact_topics_code_check` / `space_types_code_check` CHECKs. */
export const CONTACT_OPTION_CODE_PATTERN = /^[A-Z0-9]+(_[A-Z0-9]+)*$/

/** The two lists of the contact / advisory form. */
export type ContactOptionKind = 'topics' | 'spaceTypes'

/** Matches `ContactOption` in frontend-galpa/src/@types/catalog.ts. */
export interface ContactOptionDto {
    code: string
    label: string
}

/** Matches `AdminContactOption` in frontend-galpa/src/@types/catalog.ts. */
export interface AdminContactOptionDto extends ContactOptionDto {
    isActive: boolean
    sortOrder: number
}

/** `GET /catalogs/contact-options`. */
export interface ContactOptionsDto {
    topics: ContactOptionDto[]
    spaceTypes: ContactOptionDto[]
}

type OptionEntity = typeof ContactTopicOption | typeof SpaceTypeOption
type OptionRow = ContactTopicOption | SpaceTypeOption

interface KindConfig {
    entity: OptionEntity
    notFound: string
    orderMismatch: string
    tooMany: string
    /** Refused when it would leave the list without an active option (null: allowed). */
    lastActive: string | null
}

const KINDS: Record<ContactOptionKind, KindConfig> = {
    topics: {
        entity: ContactTopicOption,
        notFound: 'No encontramos ese tema.',
        orderMismatch: 'La lista debe incluir exactamente todos los temas, cada uno una sola vez.',
        tooMany: `Puedes tener como máximo ${CONTACT_OPTIONS_MAX} temas. Elimina uno que ya no uses.`,
        lastActive:
            'El formulario de contacto necesita al menos un tema activo. Activa otro antes de desactivar o eliminar este.',
    },
    spaceTypes: {
        entity: SpaceTypeOption,
        notFound: 'No encontramos ese tipo de espacio.',
        orderMismatch:
            'La lista debe incluir exactamente todos los tipos de espacio, cada uno una sola vez.',
        tooMany: `Puedes tener como máximo ${CONTACT_OPTIONS_MAX} tipos de espacio. Elimina uno que ya no uses.`,
        lastActive: null,
    },
}

/**
 * "Asesoría para elegir un equipo" -> "ASESORIA_PARA_ELEGIR_UN_EQUIPO": accents dropped, only
 * A-Z and 0-9 joined by single underscores, at most `CONTACT_OPTION_CODE_MAX_LENGTH` characters.
 */
export function contactOptionCode(label: string): string {
    const code = label
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, CONTACT_OPTION_CODE_MAX_LENGTH)
        .replace(/_+$/, '')
    return code || 'OPCION'
}

/** `base`, or `base_2`, `base_3`… (within the length limit) when it is taken. */
export function uniqueCode(base: string, taken: ReadonlySet<string>): string {
    if (!taken.has(base)) return base
    for (let suffix = 2; ; suffix++) {
        const tail = `_${suffix}`
        const candidate = `${base.slice(0, CONTACT_OPTION_CODE_MAX_LENGTH - tail.length).replace(/_+$/, '')}${tail}`
        if (!taken.has(candidate)) return candidate
    }
}

function byOrder(a: OptionRow, b: OptionRow): number {
    return a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)
}

function toAdminDto(row: OptionRow): AdminContactOptionDto {
    return { code: row.code, label: row.label, isActive: row.isActive, sortOrder: row.sortOrder }
}

/**
 * The options of the contact / advisory form: its topics and the kinds of space. Fully managed
 * from the panel (add, rename, (de)activate, delete, reorder): contact messages are not stored,
 * so nothing refers to an option once the message is sent.
 */
@Injectable()
export class ContactOptionsService {
    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    private repository(kind: ContactOptionKind): Repository<OptionRow> {
        return this.dataSource.getRepository<OptionRow>(KINDS[kind].entity)
    }

    /** Active topics and space types, in form order. */
    async listActive(): Promise<ContactOptionsDto> {
        const [topics, spaceTypes] = await Promise.all(
            (['topics', 'spaceTypes'] as const).map(async (kind) => {
                const rows = await this.repository(kind).find({ where: { isActive: true } })
                return rows.sort(byOrder).map((row) => ({ code: row.code, label: row.label }))
            }),
        )
        return { topics: topics ?? [], spaceTypes: spaceTypes ?? [] }
    }

    /** Every option of a list, inactive ones included. */
    async listForAdmin(kind: ContactOptionKind): Promise<AdminContactOptionDto[]> {
        const rows = await this.repository(kind).find()
        return rows.sort(byOrder).map(toAdminDto)
    }

    /** The label of an active option, or null (unknown or inactive codes are refused). */
    async activeLabel(kind: ContactOptionKind, code: string): Promise<string | null> {
        const row = await this.repository(kind).findOne({ where: { code } })
        return row?.isActive ? row.label : null
    }

    async create(
        kind: ContactOptionKind,
        dto: CreateContactOptionDto,
    ): Promise<AdminContactOptionDto> {
        const repository = this.repository(kind)
        const rows = await repository.find()
        if (rows.length >= CONTACT_OPTIONS_MAX) throw new ConflictException(KINDS[kind].tooMany)

        const taken = new Set(rows.map((row) => row.code))
        const row = {
            code: uniqueCode(contactOptionCode(dto.label), taken),
            label: dto.label,
            isActive: dto.isActive ?? true,
            sortOrder: rows.reduce((max, current) => Math.max(max, current.sortOrder + 1), 0),
        }
        try {
            await repository.insert(row)
        } catch (error) {
            // Another option took the same code in the meantime: try once more.
            if (!isDbError(error, '23505')) throw error
            return this.create(kind, dto)
        }
        return toAdminDto(row as OptionRow)
    }

    async update(
        kind: ContactOptionKind,
        code: string,
        dto: UpdateContactOptionDto,
    ): Promise<AdminContactOptionDto> {
        const repository = this.repository(kind)
        const row = await repository.findOneBy({ code })
        if (!row) throw new NotFoundException(KINDS[kind].notFound)

        const changes = omitUndefined({ label: dto.label, isActive: dto.isActive })
        if (!Object.keys(changes).length) {
            throw new BadRequestException('No enviaste ningún cambio.')
        }
        if (changes.isActive === false && row.isActive) await this.assertNotLastActive(kind, code)
        await repository.update({ code }, changes)
        return toAdminDto({ ...row, ...changes })
    }

    async remove(kind: ContactOptionKind, code: string): Promise<void> {
        const repository = this.repository(kind)
        const row = await repository.findOneBy({ code })
        if (!row) throw new NotFoundException(KINDS[kind].notFound)
        if (row.isActive) await this.assertNotLastActive(kind, code)
        await repository.delete({ code })
    }

    /** Rewrites every position as 0..n-1 following `codes` (exactly the existing codes). */
    async reorder(kind: ContactOptionKind, codes: string[]): Promise<AdminContactOptionDto[]> {
        const { entity, orderMismatch } = KINDS[kind]
        await this.repository(kind).manager.transaction(async (manager) => {
            const current = await manager.find<OptionRow>(entity, { select: { code: true } })
            const currentCodes = new Set(current.map((row) => row.code))
            const sameSet =
                currentCodes.size === codes.length &&
                new Set(codes).size === codes.length &&
                codes.every((code) => currentCodes.has(code))
            if (!sameSet) throw new BadRequestException(orderMismatch)

            for (const [index, code] of codes.entries()) {
                await manager.update<OptionRow>(entity, { code }, { sortOrder: index })
            }
        })
        return this.listForAdmin(kind)
    }

    /** 409 when `code` is the list's only active option and the list needs one. */
    private async assertNotLastActive(kind: ContactOptionKind, code: string): Promise<void> {
        const message = KINDS[kind].lastActive
        if (!message) return
        const active = await this.repository(kind).find({ where: { isActive: true } })
        if (!active.some((row) => row.code !== code)) throw new ConflictException(message)
    }
}
