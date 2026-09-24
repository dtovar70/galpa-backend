import { Injectable, NotFoundException } from '@nestjs/common'
import { buildCatalogConditions, CATALOG_ORDER_BY, PRODUCT_ALIAS } from './catalog-query.js'
import type { CatalogQueryDto } from './dto/catalog-query.dto.js'
import { ProductRepository } from './product.repository.js'
import { toPublicProduct, type Paginated, type PublicProductDto } from './product.mapper.js'
import { FEATURED_LIMIT, PRODUCT_NOT_FOUND, RELATED_LIMIT } from './products.constants.js'

const ACTIVE = { clause: `${PRODUCT_ALIAS}.isActive = :isActive`, params: { isActive: true } }

/** Read-only storefront catalog. Only active products are exposed. */
@Injectable()
export class CatalogService {
    constructor(private readonly products: ProductRepository) {}

    async list(query: CatalogQueryDto): Promise<Paginated<PublicProductDto>> {
        const page = await this.products.paginate(
            buildCatalogConditions(query),
            CATALOG_ORDER_BY[query.sort],
            query.page,
            query.pageSize,
        )
        return { ...page, items: page.items.map(toPublicProduct) }
    }

    async featured(limit = FEATURED_LIMIT): Promise<PublicProductDto[]> {
        const ids = await this.products.findIds([ACTIVE], CATALOG_ORDER_BY.relevance, limit)
        return (await this.products.findByIds(ids)).map(toPublicProduct)
    }

    async bySlug(slug: string): Promise<PublicProductDto> {
        const product = await this.products.findOneWithRelations({ slug, isActive: true })
        if (!product) throw new NotFoundException(PRODUCT_NOT_FOUND)
        return toPublicProduct(product)
    }

    /** Same category first (by relevance), then the rest of the catalog as a fallback. */
    async related(slug: string, limit = RELATED_LIMIT): Promise<PublicProductDto[]> {
        const product = await this.products.findOneWithRelations({ slug, isActive: true })
        if (!product) throw new NotFoundException(PRODUCT_NOT_FOUND)

        const notSelf = { clause: `${PRODUCT_ALIAS}.id <> :selfId`, params: { selfId: product.id } }
        const sameCategory = await this.products.findIds(
            [
                ACTIVE,
                notSelf,
                {
                    clause: `${PRODUCT_ALIAS}.categorySlug = :category`,
                    params: { category: product.categorySlug },
                },
            ],
            CATALOG_ORDER_BY.relevance,
            limit,
        )
        const missing = limit - sameCategory.length
        const fallback =
            missing > 0
                ? await this.products.findIds(
                      [
                          ACTIVE,
                          notSelf,
                          {
                              clause: `${PRODUCT_ALIAS}.categorySlug <> :category`,
                              params: { category: product.categorySlug },
                          },
                      ],
                      CATALOG_ORDER_BY.relevance,
                      missing,
                  )
                : []

        return (await this.products.findByIds([...sameCategory, ...fallback])).map(toPublicProduct)
    }
}
