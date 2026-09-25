import { Injectable, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, IsNull, type EntityManager } from 'typeorm'
import type { Env } from '../config/env.schema.js'
import { newId } from '../database/id.js'
import { ORDER_CODE_PATTERN } from './dto/field-names.js'
import { OrderAccessLink } from './entities/order-access-link.entity.js'
import { Order } from './entities/order.entity.js'
import { ORDER_NOT_FOUND } from './order-status.service.js'
import { accessTokenMatchesAny, generateAccessToken } from './order-token.js'

/** A link just issued: the token is only known now (the table keeps its hash). */
export interface IssuedAccessLink {
    token: string
    /** `<PUBLIC_SITE_URL>/pedido/<code>?t=<token>`. */
    url: string
    createdAt: string
}

/**
 * The customer's private links (`order_access_links`). An order may have several: checkout
 * issues the first, the admin issues new ones to send by WhatsApp. Any link that is not revoked
 * opens the order; everything else is a plain 404, like an unknown order.
 */
@Injectable()
export class OrderAccessService {
    private readonly siteUrl: string
    private readonly apiUrl: string

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        config: ConfigService<Env, true>,
    ) {
        this.siteUrl = config.get('PUBLIC_SITE_URL', { infer: true })
        this.apiUrl = config.get('PUBLIC_API_URL', { infer: true })
    }

    /** The storefront page of the order for this token. */
    customerUrl(code: string, token: string): string {
        return `${this.siteUrl}/pedido/${encodeURIComponent(code)}?t=${encodeURIComponent(token)}`
    }

    /** The public receipt PDF of the order for this token. */
    receiptUrl(code: string, token: string): string {
        return `${this.apiUrl}/api/orders/${encodeURIComponent(code)}/receipt.pdf?t=${encodeURIComponent(token)}`
    }

    /**
     * Creates a new link for the order (inside `manager`'s transaction when given). `createdById`
     * is the admin who asked for it; null for the checkout link.
     */
    async issue(
        orderId: string,
        code: string,
        createdById: string | null,
        manager: EntityManager = this.dataSource.manager,
    ): Promise<IssuedAccessLink> {
        const { token, hash } = generateAccessToken()
        const createdAt = new Date()
        await manager.insert(OrderAccessLink, {
            id: newId(),
            orderId,
            tokenHash: hash,
            createdById,
            createdAt,
            revokedAt: null,
        })
        return { token, url: this.customerUrl(code, token), createdAt: createdAt.toISOString() }
    }

    /** Issues a link for the order `code` (admin endpoint). 404 for an unknown order. */
    async issueForCode(code: string, createdById: string): Promise<IssuedAccessLink> {
        const order = await this.dataSource
            .getRepository(Order)
            .findOne({ where: { code }, select: { id: true, code: true } })
        if (!order) throw new NotFoundException(ORDER_NOT_FOUND)
        return this.issue(order.id, order.code, createdById)
    }

    /**
     * The order when `token` opens one of its non-revoked links; 404 otherwise (unknown code,
     * missing, malformed or wrong token). Every candidate is compared in constant time.
     */
    async findAuthorized(code: string, token: string | undefined): Promise<Order> {
        const order = ORDER_CODE_PATTERN.test(code)
            ? await this.dataSource.getRepository(Order).findOne({ where: { code } })
            : null
        const links = order
            ? await this.dataSource.getRepository(OrderAccessLink).find({
                  where: { orderId: order.id, revokedAt: IsNull() },
                  select: { id: true, tokenHash: true },
              })
            : []
        const matched = accessTokenMatchesAny(
            token,
            links.map((link) => link.tokenHash),
        )
        if (!order || !matched) throw new NotFoundException(ORDER_NOT_FOUND)
        return order
    }
}
