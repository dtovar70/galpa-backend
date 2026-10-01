import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { isDbError, omitUndefined } from '../database/db-errors.js'
import { newId } from '../database/id.js'
import { designTemplateFor } from '../designs/design-templates.js'
import { isWithinPixelLimits, readImageSize, type ImageSize } from '../storage/image-size.js'
import { detectImageType, type ImageType } from '../storage/image-type.js'
import { STORAGE_SERVICE, type StorageService } from '../storage/storage.service.js'
import {
    CATEGORY_NOT_FOUND,
    CategoriesService,
    sortTemplates,
    type AdminCategoryDto,
} from './categories.service.js'
import {
    duplicateColorMessage,
    MIN_TEMPLATE_SIDE,
    TEMPLATE_MESSAGES,
    templateFieldError,
} from './design-template-upload.js'
import type { CreateTemplateColorDto, UpdateTemplateColorDto } from './dto/template-color.dto.js'
import type { UpdateDesignTemplateDto } from './dto/update-design-template.dto.js'
import {
    CategoryDesignTemplate,
    MAX_TEMPLATE_COLORS,
} from './entities/category-design-template.entity.js'
import { Category, type DesignPrintArea } from './entities/category.entity.js'

/** Rounding of the stored area (0.01 % of the photo is far below a pixel of any real photo). */
const AREA_DECIMALS = 4
/** Tolerance for `x + width ≤ 1` after the client's own rounding. */
const AREA_EPSILON = 1e-6
/** Share of the photo's width or height taken by the default print area. */
const DEFAULT_AREA_SHARE = 0.5

function round(value: number): number {
    const factor = 10 ** AREA_DECIMALS
    return Math.round(value * factor) / factor
}

/**
 * A centered area covering half the photo on its tighter side, with the print's proportion (in
 * pixels) so the customer sees the real shape until the admin places it.
 */
export function defaultPrintArea(photo: ImageSize, aspect: number | null): DesignPrintArea {
    const ratio = aspect && aspect > 0 ? aspect : 1
    const widthPx = Math.min(
        photo.width * DEFAULT_AREA_SHARE,
        (photo.height * DEFAULT_AREA_SHARE) / ratio,
    )
    const width = round(widthPx / photo.width)
    const height = round((widthPx * ratio) / photo.height)
    return { x: round((1 - width) / 2), y: round((1 - height) / 2), width, height }
}

/**
 * Checks the area stays inside the photo (the DTO already bounds each value) and rounds it.
 * Throws a Spanish 400 pinned on `printArea` otherwise.
 */
export function normalizePrintArea(area: DesignPrintArea): DesignPrintArea {
    if (area.x + area.width > 1 + AREA_EPSILON || area.y + area.height > 1 + AREA_EPSILON) {
        throw templateFieldError(TEMPLATE_MESSAGES.areaOutside, 'printArea')
    }
    const x = round(area.x)
    const y = round(area.y)
    return {
        x,
        y,
        width: Math.min(round(area.width), round(1 - x)),
        height: Math.min(round(area.height), round(1 - y)),
    }
}

/** Checks the photo by its bytes (type and size); throws a Spanish 400 on `file` otherwise. */
function readTemplatePhoto(file: Express.Multer.File | undefined): {
    type: ImageType
    size: ImageSize
} {
    if (!file) throw templateFieldError(TEMPLATE_MESSAGES.missing)
    const type = detectImageType(file.buffer)
    const size = type ? readImageSize(file.buffer, type) : null
    if (!type || !size) throw templateFieldError(TEMPLATE_MESSAGES.invalidType)
    if (Math.min(size.width, size.height) < MIN_TEMPLATE_SIDE) {
        throw templateFieldError(TEMPLATE_MESSAGES.tooSmall)
    }
    if (!isWithinPixelLimits(size)) throw templateFieldError(TEMPLATE_MESSAGES.tooManyPixels)
    return { type, size }
}

function sameName(a: string, b: string): boolean {
    return a.toLocaleLowerCase('es') === b.toLocaleLowerCase('es')
}

/**
 * "Plantilla para diseñar": one photo of the blank product per garment color (public storage,
 * folder `design-templates`), where the print goes on each, and the category's physical print
 * size (shared by every color). At most `MAX_TEMPLATE_COLORS` colors, each name once per
 * category (ignoring case). The color is not stock-tracked: the stock stays per product version.
 */
@Injectable()
export class CategoryDesignTemplateService {
    private readonly logger = new Logger(CategoryDesignTemplateService.name)

    constructor(
        @InjectRepository(Category) private readonly categories: Repository<Category>,
        @InjectRepository(CategoryDesignTemplate)
        private readonly templates: Repository<CategoryDesignTemplate>,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly categoriesService: CategoriesService,
        @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    ) {}

    /**
     * Adds a garment color with its photo, last in the list. Its print area starts as the first
     * color's (same framing), else a centered one in the print proportion.
     */
    async addColor(
        slug: string,
        dto: CreateTemplateColorDto,
        file: Express.Multer.File | undefined,
    ): Promise<AdminCategoryDto> {
        const { type, size } = readTemplatePhoto(file)
        const category = await this.find(slug)
        const colors = await this.colorsOf(slug)
        if (colors.length >= MAX_TEMPLATE_COLORS) {
            throw new BadRequestException(TEMPLATE_MESSAGES.tooManyColors)
        }
        this.assertNameFree(colors, dto.colorName)

        const stored = await this.store(slug, file!.buffer, type)
        const fallback = designTemplateFor(slug)
        const widthCm = category.designPrintWidthCm ?? fallback?.widthCm
        const heightCm = category.designPrintHeightCm ?? fallback?.heightCm
        const printArea =
            colors[0]?.printArea ??
            defaultPrintArea(size, widthCm && heightCm ? heightCm / widthCm : null)
        try {
            await this.templates.insert({
                id: newId(),
                categorySlug: slug,
                colorName: dto.colorName,
                colorHex: dto.colorHex,
                imageUrl: stored.url,
                publicId: stored.publicId,
                width: size.width,
                height: size.height,
                printArea,
                sortOrder: colors.length ? Math.max(...colors.map((c) => c.sortOrder)) + 1 : 0,
                createdAt: new Date(),
            })
        } catch (error) {
            await this.deleteFile(stored.publicId)
            // Two requests with the same name can both pass the check above.
            if (isDbError(error, '23505')) {
                throw templateFieldError(duplicateColorMessage(dto.colorName), 'colorName')
            }
            this.logger.error(`Could not save a template color of category ${slug}`, error as Error)
            throw templateFieldError(TEMPLATE_MESSAGES.uploadFailed)
        }
        return this.categoriesService.findForAdmin(slug)
    }

    /** Renames a color, changes its swatch and/or places its print area. */
    async updateColor(
        slug: string,
        colorId: string,
        dto: UpdateTemplateColorDto,
    ): Promise<AdminCategoryDto> {
        const colors = await this.colorsOf(slug, true)
        const color = this.colorIn(colors, colorId)
        if (dto.colorName !== undefined) {
            this.assertNameFree(
                colors.filter((other) => other.id !== color.id),
                dto.colorName,
            )
        }
        const changes = omitUndefined({
            colorName: dto.colorName,
            colorHex: dto.colorHex,
            printArea: dto.printArea ? normalizePrintArea(dto.printArea) : undefined,
        })
        if (Object.keys(changes).length) {
            try {
                await this.templates.update({ id: color.id, categorySlug: slug }, changes)
            } catch (error) {
                if (isDbError(error, '23505') && dto.colorName !== undefined) {
                    throw templateFieldError(duplicateColorMessage(dto.colorName), 'colorName')
                }
                throw error
            }
        }
        return this.categoriesService.findForAdmin(slug)
    }

    /** Replaces a color's photo, keeping its print area, and deletes the previous file. */
    async replacePhoto(
        slug: string,
        colorId: string,
        file: Express.Multer.File | undefined,
    ): Promise<AdminCategoryDto> {
        const { type, size } = readTemplatePhoto(file)
        const color = this.colorIn(await this.colorsOf(slug, true), colorId)
        const previousPublicId = color.publicId

        const stored = await this.store(slug, file!.buffer, type)
        try {
            await this.templates.update(
                { id: color.id, categorySlug: slug },
                {
                    imageUrl: stored.url,
                    publicId: stored.publicId,
                    width: size.width,
                    height: size.height,
                },
            )
        } catch (error) {
            this.logger.error(`Could not save the template of category ${slug}`, error as Error)
            await this.deleteFile(stored.publicId)
            throw templateFieldError(TEMPLATE_MESSAGES.uploadFailed)
        }
        await this.deleteFile(previousPublicId)
        return this.categoriesService.findForAdmin(slug)
    }

    /**
     * Removes a color and deletes its photo. Designs already made on it keep their color name
     * and swatch (a snapshot).
     */
    async removeColor(slug: string, colorId: string): Promise<AdminCategoryDto> {
        const color = this.colorIn(await this.colorsOf(slug, true), colorId)
        await this.templates.delete({ id: color.id, categorySlug: slug })
        await this.deleteFile(color.publicId)
        return this.categoriesService.findForAdmin(slug)
    }

    /** Sets the colors' order from the full list of their ids (the first is the default). */
    async reorderColors(slug: string, colorIds: string[]): Promise<AdminCategoryDto> {
        const colors = await this.colorsOf(slug, true)
        const current = new Set(colors.map((color) => color.id))
        const sameSet =
            current.size === colorIds.length &&
            new Set(colorIds).size === colorIds.length &&
            colorIds.every((id) => current.has(id))
        if (!sameSet) throw new BadRequestException(TEMPLATE_MESSAGES.colorsMismatch)

        await this.dataSource.transaction(async (manager) => {
            for (const [index, id] of colorIds.entries()) {
                await manager.update(
                    CategoryDesignTemplate,
                    { id, categorySlug: slug },
                    { sortOrder: index },
                )
            }
        })
        return this.categoriesService.findForAdmin(slug)
    }

    /** The physical print size, shared by every color (and by an illustration template). */
    async update(slug: string, dto: UpdateDesignTemplateDto): Promise<AdminCategoryDto> {
        await this.find(slug)
        await this.categories.update(
            { slug },
            { designPrintWidthCm: dto.printWidthCm, designPrintHeightCm: dto.printHeightCm },
        )
        return this.categoriesService.findForAdmin(slug)
    }

    private async find(slug: string): Promise<Category> {
        const category = await this.categories.findOneBy({ slug })
        if (!category) throw new NotFoundException(CATEGORY_NOT_FOUND)
        return category
    }

    /** The category's colors, in order; `checkCategory` 404s an unknown category first. */
    private async colorsOf(slug: string, checkCategory = false): Promise<CategoryDesignTemplate[]> {
        if (checkCategory) await this.find(slug)
        return sortTemplates(await this.templates.find({ where: { categorySlug: slug } }))
    }

    private colorIn(colors: CategoryDesignTemplate[], colorId: string): CategoryDesignTemplate {
        const color = colors.find((candidate) => candidate.id === colorId)
        if (!color) throw new NotFoundException(TEMPLATE_MESSAGES.noColor)
        return color
    }

    private assertNameFree(colors: readonly CategoryDesignTemplate[], name: string): void {
        if (colors.some((color) => sameName(color.colorName, name))) {
            throw templateFieldError(duplicateColorMessage(name), 'colorName')
        }
    }

    private store(slug: string, buffer: Buffer, type: ImageType) {
        return this.storage.upload({ buffer, type }, 'design-templates').catch((error: unknown) => {
            this.logger.error(`Template upload failed for category ${slug}`, error as Error)
            throw templateFieldError(TEMPLATE_MESSAGES.uploadFailed)
        })
    }

    /** Best effort: a file left behind is only wasted space, never a broken category. */
    private async deleteFile(publicId: string): Promise<void> {
        await this.storage.delete(publicId).catch((error: unknown) => {
            this.logger.warn(`Could not delete template image "${publicId}": ${String(error)}`)
        })
    }
}
