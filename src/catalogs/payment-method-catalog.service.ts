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
import {
    PAYMENT_METHOD_CURRENCY,
    PAYMENT_METHODS,
    isPaymentMethod,
    type PaymentCurrency,
    type PaymentMethod,
} from '../common/payment-methods.js'
import type { Env } from '../config/env.schema.js'
import { omitUndefined } from '../database/db-errors.js'
import type { UpdatePaymentMethodDto } from './dto/update-payment-method.dto.js'
import { PaymentMethodDefinition } from './entities/payment-method-definition.entity.js'
import { diffStatusCodes, prettifyStatusCode } from './order-status-catalog.service.js'
import type { PaymentMethodIcon } from './payment-method-icons.js'

export const PAYMENT_METHOD_NOT_FOUND = 'No encontramos ese método de pago.'
export const PAYMENT_METHOD_ORDER_MISMATCH =
    'La lista debe incluir exactamente todos los métodos de pago, cada uno una sola vez.'
/** Sub-route of `admin/catalogs/payment-methods` used to reorder ("order" is never a code). */
export const PAYMENT_METHOD_ORDER_ROUTE = 'order'

/** Matches `PaymentMethodInfo` in frontend-galpa/src/@types/catalog.ts. */
export interface PaymentMethodCatalogDto {
    code: PaymentMethod
    label: string
    description: string
    icon: PaymentMethodIcon
    /** Fixed by the code: bolívares for Pago Móvil and transfers, dollars otherwise. */
    currency: PaymentCurrency
    sortOrder: number
}

/** Name of a payment method code; never throws (unknown codes are prettified). */
export type PaymentMethodLabeler = (code: PaymentMethod) => string

function byOrder(a: PaymentMethodCatalogDto, b: PaymentMethodCatalogDto): number {
    return a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)
}

function toDto(row: PaymentMethodDefinition): PaymentMethodCatalogDto | null {
    if (!isPaymentMethod(row.code)) return null
    return {
        code: row.code,
        label: row.label,
        description: row.description,
        icon: row.icon,
        currency: PAYMENT_METHOD_CURRENCY[row.code],
        sortOrder: row.sortOrder,
    }
}

/**
 * The payment method catalog (names, checkout help texts, icons and order), kept in memory: it
 * is read by every order response, email and Telegram message, and changes only through the
 * admin endpoints of this service, which drop the cached copy. With several API instances an
 * edit reaches the others on their next restart.
 *
 * At startup it checks that the table holds exactly the codes of `PAYMENT_METHODS`: a missing
 * seed or a code added only on one side fails fast outside production and is logged in it.
 */
@Injectable()
export class PaymentMethodCatalogService implements OnApplicationBootstrap {
    private readonly logger = new Logger(PaymentMethodCatalogService.name)
    private cached: Promise<PaymentMethodCatalogDto[]> | null = null

    constructor(
        @InjectRepository(PaymentMethodDefinition)
        private readonly methods: Repository<PaymentMethodDefinition>,
        private readonly config: ConfigService<Env, true>,
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        await this.verifyCodes()
    }

    /** Compares the table with `PAYMENT_METHODS`; throws outside production when they differ. */
    async verifyCodes(): Promise<void> {
        const rows = await this.methods.find({ select: { code: true } })
        const { missing, unknown } = diffStatusCodes(
            rows.map((row) => row.code),
            PAYMENT_METHODS,
        )
        if (!missing.length && !unknown.length) return

        const problems = [
            missing.length ? `missing in payment_methods: ${missing.join(', ')}` : '',
            unknown.length ? `unknown to the code (PAYMENT_METHODS): ${unknown.join(', ')}` : '',
        ].filter(Boolean)
        const message =
            `The payment method catalog does not match PAYMENT_METHODS (${problems.join('; ')}). ` +
            'Run the pending migrations (npm run db:migrate) or add the method to both sides.'
        this.logger.error(message)
        if (this.config.get('NODE_ENV', { infer: true }) !== 'production') {
            throw new Error(message)
        }
    }

    /** Every method, sorted by `sortOrder`. Loaded once and reused until an admin edit. */
    getCatalog(): Promise<PaymentMethodCatalogDto[]> {
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

    /** Names by code, for orders, emails, Telegram, WhatsApp and the receipt. */
    async labeler(): Promise<PaymentMethodLabeler> {
        const catalog = await this.getCatalog()
        const labels = new Map(catalog.map((method) => [method.code, method.label]))
        return (code) => labels.get(code) ?? prettifyStatusCode(code)
    }

    /** `methods` in catalog order (checkout's order); codes the catalog lacks go last. */
    async sort(methods: readonly PaymentMethod[]): Promise<PaymentMethod[]> {
        const catalog = await this.getCatalog()
        const position = new Map(catalog.map((method, index) => [method.code, index]))
        const at = (code: PaymentMethod) => position.get(code) ?? catalog.length
        return [...methods].sort((a, b) => at(a) - at(b))
    }

    async update(code: string, dto: UpdatePaymentMethodDto): Promise<PaymentMethodCatalogDto[]> {
        if (!(await this.methods.existsBy({ code }))) {
            throw new NotFoundException(PAYMENT_METHOD_NOT_FOUND)
        }
        const changes = omitUndefined({
            label: dto.label,
            description: dto.description,
            icon: dto.icon,
        })
        if (!Object.keys(changes).length) {
            throw new BadRequestException('No enviaste ningún cambio.')
        }
        try {
            await this.methods.update({ code }, changes)
        } finally {
            this.cached = null
        }
        return this.getCatalog()
    }

    /** Rewrites every position as 0..n-1 following `codes` (exactly the existing codes). */
    async reorder(codes: string[]): Promise<PaymentMethodCatalogDto[]> {
        try {
            await this.methods.manager.transaction(async (manager) => {
                const current = await manager.find(PaymentMethodDefinition, {
                    select: { code: true },
                })
                const currentCodes = new Set(current.map((method) => method.code))
                const sameSet =
                    currentCodes.size === codes.length &&
                    new Set(codes).size === codes.length &&
                    codes.every((code) => currentCodes.has(code))
                if (!sameSet) throw new BadRequestException(PAYMENT_METHOD_ORDER_MISMATCH)

                for (const [index, code] of codes.entries()) {
                    await manager.update(PaymentMethodDefinition, { code }, { sortOrder: index })
                }
            })
        } finally {
            this.cached = null
        }
        return this.getCatalog()
    }

    private async load(): Promise<PaymentMethodCatalogDto[]> {
        const rows = await this.methods.find()
        return rows
            .map(toDto)
            .filter((method) => method !== null)
            .sort(byOrder)
    }
}
