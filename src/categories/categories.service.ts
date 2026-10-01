import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { slugify } from '../common/utils/text.util.js'
import { isDbError, omitUndefined } from '../database/db-errors.js'
import {
    designTemplateFor,
    isDesignDisabled,
    resolveDesignTemplate,
} from '../designs/design-templates.js'
import { Product } from '../products/entities/product.entity.js'
import type { CreateCategoryDto } from './dto/create-category.dto.js'
import { CATEGORY_SLUG_MAX_LENGTH } from './dto/field-names.js'
import type { UpdateCategoryDto } from './dto/update-category.dto.js'
import {
    CategoryDesignTemplate,
    MAX_TEMPLATE_COLORS,
} from './entities/category-design-template.entity.js'
import { Category, type DesignPrintArea } from './entities/category.entity.js'

/** A category row as the mappers need it (no relations loaded). */
export type CategoryRow = Omit<Category, 'products' | 'designTemplates'>

export const CATEGORY_NOT_FOUND = 'No encontramos la categoría solicitada.'

/** Sub-route of `admin/categories` used to reorder; reserved so no category slug can shadow it. */
export const CATEGORY_ORDER_ROUTE = 'order'

export const CATEGORY_ORDER_MISMATCH =
    'La lista debe incluir exactamente todas las categorías, cada una una sola vez.'

/** "Plantilla para diseñar": one photo of the blank product per garment color. */
export interface DesignTemplateColorDto {
    id: string
    /** "Negro", as the customer reads it. */
    name: string
    /** `#RRGGBB`: the swatch. */
    hex: string
    imageUrl: string
    /** Pixel size of the photo. */
    width: number
    height: number
    /** Where the print goes, relative to the photo (0..1). */
    printArea: DesignPrintArea
}

/** What the design editor draws on: the colors' photos, all with the same print size. */
export interface DesignTemplateDto {
    printWidthCm: number
    printHeightCm: number
    /** In the admin's order; the first one is the editor's default. Never empty. */
    colors: DesignTemplateColorDto[]
}

/** Matches `Category` in frontend-cups/src/@types/product.ts. */
export interface CategoryDto {
    slug: string
    name: string
    tagline: string
    description: string
    colorHex: string
    /** Number of active products in the category. */
    productCount: number
    /**
     * Its personalizable products offer "Diseña con tu imagen": the category has at least one
     * garment color photo (with its print size) or a generated illustration template.
     */
    designEnabled: boolean
    /** The template photos, when there are some (otherwise the editor draws the illustration). */
    designTemplate: DesignTemplateDto | null
    /** Effective print size in cm (own or the illustration's); null when not designable. */
    designPrintSize: { widthCm: number; heightCm: number } | null
}

/** The raw design template settings, for the admin form (whatever is set so far). */
export interface AdminDesignTemplateDto {
    /** Every garment color, in order (with or without a print size set yet). */
    colors: DesignTemplateColorDto[]
    /** How many colors a category may have. */
    maxColors: number
    printWidthCm: number | null
    printHeightCm: number | null
    /** The category has a generated illustration template (used while there is no photo). */
    hasIllustration: boolean
    /** The editor is turned off for this category (see DESIGN_DISABLED_CATEGORIES). */
    designDisabled: boolean
}

/** Matches `AdminCategory` in frontend-cups/src/@types/admin.ts. */
export interface AdminCategoryDto extends CategoryDto {
    sortOrder: number
    /** Every product in the category, hidden ones included. Deleting requires zero. */
    totalProductCount: number
    /** Products tagged `personalizable` (hidden ones included): they use the design template. */
    personalizableProductCount: number
    designTemplateSettings: AdminDesignTemplateDto
}

interface ProductCounts {
    active: number
    total: number
    personalizable: number
}

const NO_PRODUCTS: ProductCounts = { active: 0, total: 0, personalizable: 0 }

/** "tiene 1 producto. Muévelo…" / "tiene 6 productos. Muévelos…" */
export function categoryInUseMessage(count: number): string {
    return count === 1
        ? 'No puedes eliminar esta categoría porque tiene 1 producto. Muévelo a otra categoría o elimínalo primero.'
        : `No puedes eliminar esta categoría porque tiene ${count} productos. Muévelos a otra categoría o elimínalos primero.`
}

function slugTakenMessage(slug: string): string {
    return `Ya existe una categoría con el slug "${slug}".`
}

@Injectable()
export class CategoriesService {
    constructor(
        @InjectRepository(Category) private readonly categories: Repository<Category>,
        @InjectRepository(Product) private readonly products: Repository<Product>,
        @InjectRepository(CategoryDesignTemplate)
        private readonly templates: Repository<CategoryDesignTemplate>,
    ) {}

    /** Public list, in menu order, with the count of visible products. */
    async list(): Promise<CategoryDto[]> {
        const [categories, counts, colors] = await Promise.all([
            this.findOrdered(),
            this.productCounts(),
            this.templateColors(),
        ])
        return categories.map((category) =>
            toDto(category, counts.get(category.slug), colors.get(category.slug)),
        )
    }

    /** Admin list: same order, plus the position and the count of every product. */
    async listForAdmin(): Promise<AdminCategoryDto[]> {
        const [categories, counts, colors] = await Promise.all([
            this.findOrdered(),
            this.productCounts(),
            this.templateColors(),
        ])
        return categories.map((category) =>
            toAdminDto(category, counts.get(category.slug), colors.get(category.slug)),
        )
    }

    async create(dto: CreateCategoryDto): Promise<AdminCategoryDto> {
        const slug = dto.slug ?? slugify(dto.name).slice(0, CATEGORY_SLUG_MAX_LENGTH)
        if (!slug) {
            throw new BadRequestException(
                'No pudimos generar un slug a partir del nombre. Escribe uno a mano.',
            )
        }
        if (slug === CATEGORY_ORDER_ROUTE) {
            throw new BadRequestException(`El slug "${slug}" está reservado. Elige otro.`)
        }
        if (await this.categories.existsBy({ slug })) {
            throw new ConflictException(slugTakenMessage(slug))
        }

        const category: CategoryRow = {
            slug,
            name: dto.name,
            tagline: dto.tagline ?? '',
            description: dto.description ?? '',
            colorHex: dto.colorHex,
            sortOrder: dto.sortOrder ?? (await this.nextSortOrder()),
            designPrintWidthCm: null,
            designPrintHeightCm: null,
        }
        try {
            await this.categories.insert(category)
        } catch (error) {
            // Two requests with the same slug can both pass the check above.
            if (isDbError(error, '23505')) throw new ConflictException(slugTakenMessage(slug))
            throw error
        }
        return toAdminDto(category, NO_PRODUCTS)
    }

    async update(slug: string, dto: UpdateCategoryDto): Promise<AdminCategoryDto> {
        const category = await this.categories.findOneBy({ slug })
        if (!category) throw new NotFoundException(CATEGORY_NOT_FOUND)

        const changes = omitUndefined({ ...dto })
        if (Object.keys(changes).length) {
            await this.categories.update({ slug }, changes)
        }
        const updated = { ...category, ...changes }
        const [counts, colors] = await Promise.all([
            this.productCounts(slug),
            this.templateColors(slug),
        ])
        return toAdminDto(updated, counts.get(slug), colors.get(slug))
    }

    /** One category as the admin sees it (after a design template change). */
    async findForAdmin(slug: string): Promise<AdminCategoryDto> {
        const category = await this.categories.findOneBy({ slug })
        if (!category) throw new NotFoundException(CATEGORY_NOT_FOUND)
        const [counts, colors] = await Promise.all([
            this.productCounts(slug),
            this.templateColors(slug),
        ])
        return toAdminDto(category, counts.get(slug), colors.get(slug))
    }

    /**
     * Rewrites every position as 0..n-1 following `slugs`, which must be exactly the set of
     * existing slugs. Runs in one transaction so the menu never shows a half-applied order.
     */
    async reorder(slugs: string[]): Promise<AdminCategoryDto[]> {
        await this.categories.manager.transaction(async (manager) => {
            const current = await manager.find(Category, { select: { slug: true } })
            const currentSlugs = new Set(current.map((category) => category.slug))
            const sameSet =
                currentSlugs.size === slugs.length &&
                new Set(slugs).size === slugs.length &&
                slugs.every((slug) => currentSlugs.has(slug))
            if (!sameSet) throw new BadRequestException(CATEGORY_ORDER_MISMATCH)

            for (const [index, slug] of slugs.entries()) {
                await manager.update(Category, { slug }, { sortOrder: index })
            }
        })
        return this.listForAdmin()
    }

    /**
     * Only empty categories can be deleted. The `products.category_slug` foreign key is
     * `ON DELETE RESTRICT` as a safety net; this check exists to give a helpful message.
     */
    async remove(slug: string): Promise<void> {
        if (!(await this.categories.existsBy({ slug }))) {
            throw new NotFoundException(CATEGORY_NOT_FOUND)
        }
        await this.assertEmpty(slug)

        try {
            const result = await this.categories.delete({ slug })
            if (!result.affected) throw new NotFoundException(CATEGORY_NOT_FOUND)
        } catch (error) {
            // A product was added between the check and the delete.
            if (isDbError(error, '23503')) await this.assertEmpty(slug)
            throw error
        }
    }

    private async assertEmpty(slug: string): Promise<void> {
        const count = await this.products.countBy({ categorySlug: slug })
        if (count > 0) throw new ConflictException(categoryInUseMessage(count))
    }

    private findOrdered(): Promise<Category[]> {
        return this.categories.find({ order: { sortOrder: 'ASC', slug: 'ASC' } })
    }

    /** The garment color photos per category slug, in order (optionally for a single category). */
    private async templateColors(slug?: string): Promise<Map<string, CategoryDesignTemplate[]>> {
        const rows = await this.templates.find({
            where: slug ? { categorySlug: slug } : {},
            order: { sortOrder: 'ASC', createdAt: 'ASC' },
        })
        const bySlug = new Map<string, CategoryDesignTemplate[]>()
        for (const row of sortTemplates(rows)) {
            bySlug.set(row.categorySlug, [...(bySlug.get(row.categorySlug) ?? []), row])
        }
        return bySlug
    }

    private async nextSortOrder(): Promise<number> {
        const row = await this.categories
            .createQueryBuilder('category')
            .select('MAX(category.sortOrder)', 'max')
            .getRawOne<{ max: number | null }>()
        return row?.max === null || row?.max === undefined ? 0 : Number(row.max) + 1
    }

    /** Active and total product counts per category slug (optionally for a single category). */
    private async productCounts(slug?: string): Promise<Map<string, ProductCounts>> {
        const query = this.products
            .createQueryBuilder('product')
            .select('product.categorySlug', 'slug')
            .addSelect('COUNT(*) FILTER (WHERE product.isActive)', 'active')
            .addSelect('COUNT(*)', 'total')
            .addSelect(
                "COUNT(*) FILTER (WHERE 'personalizable' = ANY(product.tags))",
                'personalizable',
            )
            .groupBy('product.categorySlug')
        if (slug) query.where('product.categorySlug = :slug', { slug })

        const rows = await query.getRawMany<{
            slug: string
            active: string
            total: string
            personalizable: string
        }>()
        return new Map(
            rows.map((row) => [
                row.slug,
                {
                    active: Number(row.active),
                    total: Number(row.total),
                    personalizable: Number(row.personalizable ?? 0),
                },
            ]),
        )
    }
}

/** The admin's order: position, then age (the query orders the same way). */
export function sortTemplates<T extends Pick<CategoryDesignTemplate, 'sortOrder' | 'createdAt'>>(
    rows: readonly T[],
): T[] {
    return [...rows].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.createdAt.getTime() - b.createdAt.getTime(),
    )
}

export function toTemplateColorDto(row: CategoryDesignTemplate): DesignTemplateColorDto {
    return {
        id: row.id,
        name: row.colorName,
        hex: row.colorHex,
        imageUrl: row.imageUrl,
        width: row.width,
        height: row.height,
        printArea: row.printArea,
    }
}

function toDto(
    category: CategoryRow,
    counts: ProductCounts = NO_PRODUCTS,
    colors: readonly CategoryDesignTemplate[] = [],
): CategoryDto {
    return {
        slug: category.slug,
        name: category.name,
        tagline: category.tagline,
        description: category.description,
        colorHex: category.colorHex,
        productCount: counts.active,
        ...designFieldsOf(category, colors),
    }
}

type DesignFields = Pick<CategoryDto, 'designEnabled' | 'designTemplate' | 'designPrintSize'>

/** `colors`: the category's garment color photos, in order. */
export function designFieldsOf(
    category: CategoryRow,
    colors: readonly CategoryDesignTemplate[],
): DesignFields {
    const size = resolveDesignTemplate(category, colors.length > 0)
    const photos =
        size && colors.length
            ? {
                  printWidthCm: size.widthCm,
                  printHeightCm: size.heightCm,
                  colors: colors.map(toTemplateColorDto),
              }
            : null
    return {
        designEnabled: size !== null,
        designTemplate: photos,
        designPrintSize: size ? { widthCm: size.widthCm, heightCm: size.heightCm } : null,
    }
}

function toAdminDto(
    category: CategoryRow,
    counts: ProductCounts = NO_PRODUCTS,
    colors: readonly CategoryDesignTemplate[] = [],
): AdminCategoryDto {
    return {
        ...toDto(category, counts, colors),
        sortOrder: category.sortOrder,
        totalProductCount: counts.total,
        personalizableProductCount: counts.personalizable,
        designTemplateSettings: {
            colors: colors.map(toTemplateColorDto),
            maxColors: MAX_TEMPLATE_COLORS,
            printWidthCm: category.designPrintWidthCm,
            printHeightCm: category.designPrintHeightCm,
            hasIllustration: designTemplateFor(category.slug) !== null,
            designDisabled: isDesignDisabled(category.slug),
        },
    }
}
