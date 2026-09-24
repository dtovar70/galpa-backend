import {
    BadRequestException,
    ConflictException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { Category } from '../categories/entities/category.entity.js'
import { slugify } from '../common/utils/text.util.js'
import { isDbError, omitUndefined } from '../database/db-errors.js'
import { newId } from '../database/id.js'
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.service.js'
import { buildSearchConditions, PRODUCT_ALIAS, type Condition } from './catalog-query.js'
import type { AdminProductQueryDto } from './dto/admin-product-query.dto.js'
import type { CreateProductDto, ProductVariantInputDto } from './dto/create-product.dto.js'
import type { UpdateProductDto } from './dto/update-product.dto.js'
import { ProductImage } from './entities/product-image.entity.js'
import { ProductVariant } from './entities/product-variant.entity.js'
import { Product } from './entities/product.entity.js'
import { computeDerivedFields } from './product-derived.js'
import { ProductRepository } from './product.repository.js'
import { toAdminProduct, type AdminProductDto, type Paginated } from './product.mapper.js'
import { PRODUCT_NOT_FOUND } from './products.constants.js'

function variantRows(productId: string, variants: ProductVariantInputDto[]) {
    return variants.map((variant, index) => ({
        id: newId(),
        productId,
        label: variant.label,
        priceDelta: variant.priceDelta,
        colorHex: variant.colorHex ?? null,
        sortOrder: index,
    }))
}

@Injectable()
export class AdminProductsService {
    private readonly logger = new Logger(AdminProductsService.name)

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        @InjectRepository(Product) private readonly products: Repository<Product>,
        @InjectRepository(Category) private readonly categories: Repository<Category>,
        @InjectRepository(ProductImage) private readonly images: Repository<ProductImage>,
        private readonly productReader: ProductRepository,
        @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    ) {}

    async list(query: AdminProductQueryDto): Promise<Paginated<AdminProductDto>> {
        const conditions: Condition[] = [...buildSearchConditions(query.search)]
        if (query.category) {
            conditions.push({
                clause: `${PRODUCT_ALIAS}.categorySlug = :category`,
                params: { category: query.category },
            })
        }
        if (query.isActive !== undefined) {
            conditions.push({
                clause: `${PRODUCT_ALIAS}.isActive = :isActive`,
                params: { isActive: query.isActive },
            })
        }

        const page = await this.productReader.paginate(
            conditions,
            [
                [`${PRODUCT_ALIAS}.updatedAt`, 'DESC'],
                [`${PRODUCT_ALIAS}.id`, 'ASC'],
            ],
            query.page,
            query.pageSize,
        )
        return { ...page, items: page.items.map(toAdminProduct) }
    }

    async get(id: string): Promise<AdminProductDto> {
        return toAdminProduct(await this.load(id))
    }

    async create(dto: CreateProductDto): Promise<AdminProductDto> {
        await this.assertCategoryExists(dto.categorySlug)
        const slug = dto.slug ?? slugify(dto.name)
        if (!slug) {
            throw new BadRequestException('No pudimos generar un slug a partir del nombre.')
        }
        const tags = dto.tags ?? []
        const rating = dto.rating ?? 0
        this.assertCompareAtPrice(dto.price, dto.compareAtPrice)

        const id = newId()
        try {
            await this.dataSource.transaction(async (manager) => {
                await manager.insert(Product, {
                    id,
                    slug,
                    name: dto.name,
                    categorySlug: dto.categorySlug,
                    price: dto.price,
                    compareAtPrice: dto.compareAtPrice ?? null,
                    printText: dto.printText,
                    colorHex: dto.colorHex,
                    description: dto.description,
                    highlights: dto.highlights ?? [],
                    tags,
                    rating,
                    reviewCount: dto.reviewCount ?? 0,
                    stock: dto.stock,
                    isActive: dto.isActive ?? true,
                    ...computeDerivedFields({ ...dto, tags, rating }),
                })
                const variants = variantRows(id, dto.variants ?? [])
                if (variants.length) await manager.insert(ProductVariant, variants)
            })
        } catch (error) {
            this.rethrowConstraintError(error, slug)
        }
        return this.get(id)
    }

    async update(id: string, dto: UpdateProductDto): Promise<AdminProductDto> {
        const current = await this.products.findOneBy({ id })
        if (!current) throw new NotFoundException(PRODUCT_NOT_FOUND)
        if (dto.categorySlug) await this.assertCategoryExists(dto.categorySlug)

        const merged = {
            name: dto.name ?? current.name,
            description: dto.description ?? current.description,
            printText: dto.printText ?? current.printText,
            tags: dto.tags ?? current.tags,
            rating: dto.rating ?? current.rating,
        }
        const price = dto.price ?? current.price
        const compareAtPrice =
            dto.compareAtPrice === undefined ? current.compareAtPrice : dto.compareAtPrice
        this.assertCompareAtPrice(price, compareAtPrice)

        const { variants, ...fields } = dto
        try {
            // Replacing variants and updating the product must succeed or fail together.
            await this.dataSource.transaction(async (manager) => {
                await manager.update(
                    Product,
                    { id },
                    {
                        ...omitUndefined(fields),
                        ...computeDerivedFields(merged),
                    },
                )
                if (variants) {
                    await manager.delete(ProductVariant, { productId: id })
                    const rows = variantRows(id, variants)
                    if (rows.length) await manager.insert(ProductVariant, rows)
                }
            })
        } catch (error) {
            this.rethrowConstraintError(error, dto.slug ?? current.slug)
        }
        return this.get(id)
    }

    async setActive(id: string, isActive?: boolean): Promise<AdminProductDto> {
        const current = await this.products.findOne({
            where: { id },
            select: { id: true, isActive: true },
        })
        if (!current) throw new NotFoundException(PRODUCT_NOT_FOUND)

        await this.products.update({ id }, { isActive: isActive ?? !current.isActive })
        return this.get(id)
    }

    async remove(id: string): Promise<void> {
        const images = await this.images.find({
            where: { productId: id },
            select: { publicId: true },
        })
        // Variants and images are removed by ON DELETE CASCADE.
        const result = await this.products.delete({ id })
        if (!result.affected) throw new NotFoundException(PRODUCT_NOT_FOUND)

        // Files are removed after the rows are gone; a failure only leaves an orphan file.
        await Promise.all(
            images.map(({ publicId }) =>
                this.storage.delete(publicId).catch((error: unknown) => {
                    this.logger.warn(
                        `Could not delete stored image "${publicId}": ${String(error)}`,
                    )
                }),
            ),
        )
    }

    private async load(id: string): Promise<Product> {
        const product = await this.productReader.findOneWithRelations({ id })
        if (!product) throw new NotFoundException(PRODUCT_NOT_FOUND)
        return product
    }

    private async assertCategoryExists(slug: string): Promise<void> {
        const exists = await this.categories.existsBy({ slug })
        if (!exists) {
            throw new BadRequestException(`La categoría "${slug}" no existe.`)
        }
    }

    private assertCompareAtPrice(price: number, compareAtPrice?: number | null): void {
        if (compareAtPrice !== undefined && compareAtPrice !== null && compareAtPrice <= price) {
            throw new BadRequestException(
                'El precio anterior (compareAtPrice) debe ser mayor que el precio actual.',
            )
        }
    }

    private rethrowConstraintError(error: unknown, slug: string): never {
        if (isDbError(error, '23505')) {
            throw new ConflictException(`Ya existe un producto con el slug "${slug}".`)
        }
        if (isDbError(error, '23503')) {
            throw new BadRequestException('La categoría indicada no existe.')
        }
        throw error
    }
}
