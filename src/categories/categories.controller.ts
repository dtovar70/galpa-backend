import {
    Body,
    Controller,
    Delete,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    UploadedFile,
    UseFilters,
    UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Public } from '../common/decorators/public.decorator.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { Role } from '../auth/role.enum.js'
import {
    CATEGORY_ORDER_ROUTE,
    CategoriesService,
    type AdminCategoryDto,
    type CategoryDto,
} from './categories.service.js'
import { CategoryDesignTemplateService } from './category-design-template.service.js'
import {
    TEMPLATE_COLOR_UPLOAD_OPTIONS,
    TEMPLATE_FILE_FIELD,
    TEMPLATE_UPLOAD_OPTIONS,
    TemplateUploadErrorsFilter,
} from './design-template-upload.js'
import { CreateCategoryDto } from './dto/create-category.dto.js'
import { ReorderCategoriesDto } from './dto/reorder-categories.dto.js'
import {
    CreateTemplateColorDto,
    ReorderTemplateColorsDto,
    UpdateTemplateColorDto,
} from './dto/template-color.dto.js'
import { UpdateCategoryDto } from './dto/update-category.dto.js'
import { UpdateDesignTemplateDto } from './dto/update-design-template.dto.js'

@Public()
@Controller('categories')
export class CategoriesController {
    constructor(private readonly categories: CategoriesService) {}

    @Get()
    list(): Promise<CategoryDto[]> {
        return this.categories.list()
    }
}

@Roles(Role.ADMIN, Role.EDITOR)
@Controller('admin/categories')
export class AdminCategoriesController {
    constructor(
        private readonly categories: CategoriesService,
        private readonly templates: CategoryDesignTemplateService,
    ) {}

    @Get()
    list(): Promise<AdminCategoryDto[]> {
        return this.categories.listForAdmin()
    }

    @Post()
    create(@Body() dto: CreateCategoryDto): Promise<AdminCategoryDto> {
        return this.categories.create(dto)
    }

    /**
     * Sets the menu order from the full list of slugs. Declared before `PATCH :slug` so "order"
     * is never matched as a slug (and "order" is reserved, so no category can use it).
     */
    @Patch(CATEGORY_ORDER_ROUTE)
    reorder(@Body() dto: ReorderCategoriesDto): Promise<AdminCategoryDto[]> {
        return this.categories.reorder(dto.slugs)
    }

    @Patch(':slug')
    update(@Param('slug') slug: string, @Body() dto: UpdateCategoryDto): Promise<AdminCategoryDto> {
        return this.categories.update(slug, dto)
    }

    /**
     * "Plantilla para diseñar", print size in cm (shared by every garment color). The template
     * routes are for admins only.
     */
    @Roles(Role.ADMIN)
    @Patch(':slug/design-template')
    updateDesignTemplate(
        @Param('slug') slug: string,
        @Body() dto: UpdateDesignTemplateDto,
    ): Promise<AdminCategoryDto> {
        return this.templates.update(slug, dto)
    }

    /**
     * Adds a garment color. multipart/form-data: `file` (JPG/PNG/WEBP checked by its bytes, at
     * most 10 MB and at least 600 px on its short side), `colorName` and `colorHex` (#RRGGBB).
     * At most 6 colors per category, each name once (ignoring case).
     */
    @Roles(Role.ADMIN)
    @Post(':slug/design-template/colors')
    @UseFilters(TemplateUploadErrorsFilter)
    @UseInterceptors(FileInterceptor(TEMPLATE_FILE_FIELD, TEMPLATE_COLOR_UPLOAD_OPTIONS))
    addTemplateColor(
        @Param('slug') slug: string,
        @Body() dto: CreateTemplateColorDto,
        @UploadedFile() file: Express.Multer.File | undefined,
    ): Promise<AdminCategoryDto> {
        return this.templates.addColor(slug, dto, file)
    }

    /**
     * Sets the colors' order from all their ids. Declared before `PATCH colors/:colorId`; color
     * ids are UUIDs, so "order" is never one.
     */
    @Roles(Role.ADMIN)
    @Patch(`:slug/design-template/colors/${CATEGORY_ORDER_ROUTE}`)
    reorderTemplateColors(
        @Param('slug') slug: string,
        @Body() dto: ReorderTemplateColorsDto,
    ): Promise<AdminCategoryDto> {
        return this.templates.reorderColors(slug, dto.colorIds)
    }

    /** A color's name, swatch and/or print area on its photo (0..1). */
    @Roles(Role.ADMIN)
    @Patch(':slug/design-template/colors/:colorId')
    updateTemplateColor(
        @Param('slug') slug: string,
        @Param('colorId') colorId: string,
        @Body() dto: UpdateTemplateColorDto,
    ): Promise<AdminCategoryDto> {
        return this.templates.updateColor(slug, colorId, dto)
    }

    /** Replaces a color's photo (multipart `file`, same checks); its print area stays. */
    @Roles(Role.ADMIN)
    @Post(':slug/design-template/colors/:colorId/photo')
    @UseFilters(TemplateUploadErrorsFilter)
    @UseInterceptors(FileInterceptor(TEMPLATE_FILE_FIELD, TEMPLATE_UPLOAD_OPTIONS))
    replaceTemplatePhoto(
        @Param('slug') slug: string,
        @Param('colorId') colorId: string,
        @UploadedFile() file: Express.Multer.File | undefined,
    ): Promise<AdminCategoryDto> {
        return this.templates.replacePhoto(slug, colorId, file)
    }

    /** Removes a color and deletes its stored photo; the print size stays. */
    @Roles(Role.ADMIN)
    @Delete(':slug/design-template/colors/:colorId')
    removeTemplateColor(
        @Param('slug') slug: string,
        @Param('colorId') colorId: string,
    ): Promise<AdminCategoryDto> {
        return this.templates.removeColor(slug, colorId)
    }

    /** Refused with 409 while the category still has products (active or hidden). */
    @Roles(Role.ADMIN)
    @Delete(':slug')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(@Param('slug') slug: string): Promise<void> {
        return this.categories.remove(slug)
    }
}
