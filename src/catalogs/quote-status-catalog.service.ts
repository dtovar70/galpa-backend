import {
    BadRequestException,
    Injectable,
    Logger,
    NotFoundException,
    type OnApplicationBootstrap,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { Env } from '../config/env.schema.js'
import { omitUndefined } from '../database/db-errors.js'
import { QUOTE_STATUSES, type QuoteStatus } from '../quotes/quote-status.js'
import type { BadgeTone } from './badge-tones.js'
import type { UpdateQuoteStatusDto } from './dto/update-quote-status.dto.js'
import { QuoteStatusDefinition } from './entities/quote-status-definition.entity.js'
import { diffStatusCodes, prettifyStatusCode } from './order-status-catalog.service.js'

export const QUOTE_STATUS_NOT_FOUND = 'No encontramos ese estado de cotización.'

/** Matches `QuoteStatusInfo` in frontend-galpa/src/@types/catalog.ts. */
export interface QuoteStatusCatalogDto {
    code: string
    label: string
    description: string
    tone: BadgeTone
    sortOrder: number
    isTerminal: boolean
}

/** Label of a quote status code; never throws (unknown codes are prettified). */
export type QuoteStatusLabeler = (code: QuoteStatus) => string

function byOrder(a: QuoteStatusCatalogDto, b: QuoteStatusCatalogDto): number {
    return a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)
}

function toDto(row: QuoteStatusDefinition): QuoteStatusCatalogDto {
    return {
        code: row.code,
        label: row.label,
        description: row.description,
        tone: row.tone,
        sortOrder: row.sortOrder,
        isTerminal: row.isTerminal,
    }
}

/**
 * The quote status catalog (labels, help texts and badge tones), kept in memory: it is read on
 * every quote response and changes only through the admin endpoint of this service, which drops
 * the cached copy. With several API instances an edit reaches the others on their next restart.
 *
 * At startup it checks that the table holds exactly the codes of `QUOTE_STATUSES`: a missing
 * seed or a code added only on one side fails fast outside production and is logged in it.
 */
@Injectable()
export class QuoteStatusCatalogService implements OnApplicationBootstrap {
    private readonly logger = new Logger(QuoteStatusCatalogService.name)
    private cached: Promise<QuoteStatusCatalogDto[]> | null = null

    constructor(
        @InjectRepository(QuoteStatusDefinition)
        private readonly statuses: Repository<QuoteStatusDefinition>,
        private readonly config: ConfigService<Env, true>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.verifyCodes()
    }

    /** Compares the table with `QUOTE_STATUSES`; throws outside production when they differ. */
    async verifyCodes(): Promise<void> {
        const rows = await this.statuses.find({ select: { code: true } })
        const { missing, unknown } = diffStatusCodes(
            rows.map((row) => row.code),
            QUOTE_STATUSES,
        )
        if (!missing.length && !unknown.length) return

        const problems = [
            missing.length ? `missing in quote_statuses: ${missing.join(', ')}` : '',
            unknown.length ? `unknown to the code (QUOTE_STATUSES): ${unknown.join(', ')}` : '',
        ].filter(Boolean)
        const message =
            `The quote status catalog does not match QUOTE_STATUSES (${problems.join('; ')}). ` +
            'Run the pending migrations (npm run db:migrate) or add the status to both sides.'
        this.logger.error(message)
        if (this.config.get('NODE_ENV', { infer: true }) !== 'production') {
            throw new Error(message)
        }
    }

    /** Every status, sorted by `sortOrder`. Loaded once and reused until an admin edit. */
    getCatalog(): Promise<QuoteStatusCatalogDto[]> {
        if (!this.cached) {
            const loading = this.load()
            this.cached = loading
            // A failed load is not cached: the next call retries.
            loading.catch(() => {
                if (this.cached === loading) this.cached = null
            })
        }
        return this.cached
    }

    /** Admin labels by code, for the quote responses (`statusLabel`, transitions, errors). */
    async labeler(): Promise<QuoteStatusLabeler> {
        const catalog = await this.getCatalog()
        const labels = new Map(catalog.map((status) => [status.code, status.label]))
        return (code) => labels.get(code) ?? prettifyStatusCode(code)
    }

    async updateStatus(code: string, dto: UpdateQuoteStatusDto): Promise<QuoteStatusCatalogDto[]> {
        const exists = await this.statuses.existsBy({ code })
        if (!exists) throw new NotFoundException(QUOTE_STATUS_NOT_FOUND)

        const changes = omitUndefined({
            label: dto.label,
            description: dto.description,
            tone: dto.tone,
        })
        if (!Object.keys(changes).length) {
            throw new BadRequestException('No enviaste ningún cambio.')
        }
        try {
            await this.statuses.update({ code }, changes)
        } finally {
            this.cached = null
        }
        return this.getCatalog()
    }

    private async load(): Promise<QuoteStatusCatalogDto[]> {
        const rows = await this.statuses.find()
        return rows.map(toDto).sort(byOrder)
    }
}
