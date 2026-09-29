import {
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
    type OnApplicationShutdown,
} from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { SlidingWindowLimiter } from '../../telegram/rate-limiter.js'
import { Order } from '../entities/order.entity.js'
import { OrderEmailsService } from './order-emails.service.js'

/** The answer to every lookup, whether or not the code and the email match an order. */
export const ORDER_LOOKUP_REQUESTED = 'Si los datos coinciden, te enviamos un enlace a tu correo.'
export const ORDER_LOOKUP_TOO_MANY =
    'Hiciste muchas consultas seguidas. Espera unos minutos e intenta de nuevo.'

/** Per email and per order code: 3 lookups every 15 minutes (the IP limit lives on the route). */
export const ORDER_LOOKUP_LIMIT = 3
export const ORDER_LOOKUP_WINDOW_MS = 15 * 60_000

/**
 * "Consultar mi pedido": a customer who lost the link gives the order code and the checkout
 * email, and a fresh link goes to that email. Nothing tells whether an order exists:
 *
 * - `request` answers at once with the same body; the lookup and the email run in the
 *   background, so the response time does not depend on a match either.
 * - The link only ever goes to the order's own email, never to whatever was typed.
 */
@Injectable()
export class OrderLookupService implements OnApplicationShutdown {
    private readonly logger = new Logger('OrderLookup')
    private readonly emailLimiter = new SlidingWindowLimiter(
        ORDER_LOOKUP_LIMIT,
        ORDER_LOOKUP_WINDOW_MS,
    )
    private readonly codeLimiter = new SlidingWindowLimiter(
        ORDER_LOOKUP_LIMIT,
        ORDER_LOOKUP_WINDOW_MS,
    )
    /** Background lookups still running (awaited on shutdown and by tests). */
    private readonly pending = new Set<Promise<void>>()

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly emails: OrderEmailsService,
    ) {}

    async onApplicationShutdown(): Promise<void> {
        await this.idle()
    }

    /** Resolves once every background lookup finished. */
    async idle(): Promise<void> {
        while (this.pending.size) await Promise.allSettled(this.pending)
    }

    /**
     * Accepts a lookup. Throws 429 when this email or this code was asked too often (the same
     * for any value, so it tells nothing); otherwise the work continues in the background.
     */
    request(code: string, email: string): void {
        const normalizedEmail = email.trim().toLowerCase()
        const normalizedCode = code.trim().toUpperCase()
        if (!this.emailLimiter.hit(normalizedEmail) || !this.codeLimiter.hit(normalizedCode)) {
            throw new HttpException(ORDER_LOOKUP_TOO_MANY, HttpStatus.TOO_MANY_REQUESTS)
        }
        const work = this.lookup(normalizedCode, normalizedEmail)
            .catch((error: unknown) => {
                this.logger.error(
                    `Order lookup of ${normalizedCode} failed: ${error instanceof Error ? error.message : String(error)}`,
                )
            })
            .finally(() => this.pending.delete(work))
        this.pending.add(work)
    }

    private async lookup(code: string, email: string): Promise<void> {
        const order = await this.dataSource.getRepository(Order).findOne({
            where: { code },
            select: { id: true, code: true, customerName: true, customerEmail: true },
        })
        if (!order || order.customerEmail.trim().toLowerCase() !== email) {
            this.logger.log(`Order lookup for ${code}: no matching order`)
            return
        }
        if (!this.emails.enabled) {
            this.logger.log(`Order lookup for ${code} matched, but mail is off (MAIL_DRIVER=log)`)
            return
        }
        const sent = await this.emails.sendAccessLink(order)
        this.logger.log(`Order lookup for ${code} matched; link ${sent ? 'sent' : 'not sent'}`)
    }
}
