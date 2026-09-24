import { Controller, Get, Param, Query } from '@nestjs/common'
import { Public } from '../common/decorators/public.decorator.js'
import { CatalogService } from './catalog.service.js'
import { CatalogQueryDto } from './dto/catalog-query.dto.js'
import { FeaturedQueryDto, RelatedQueryDto } from './dto/limit-query.dto.js'
import type { Paginated, PublicProductDto } from './product.mapper.js'

@Public()
@Controller('products')
export class CatalogController {
    constructor(private readonly catalog: CatalogService) {}

    @Get()
    list(@Query() query: CatalogQueryDto): Promise<Paginated<PublicProductDto>> {
        return this.catalog.list(query)
    }

    // Declared before ":slug" so "featured" is not treated as a slug.
    @Get('featured')
    featured(@Query() query: FeaturedQueryDto): Promise<PublicProductDto[]> {
        return this.catalog.featured(query.limit)
    }

    @Get(':slug')
    bySlug(@Param('slug') slug: string): Promise<PublicProductDto> {
        return this.catalog.bySlug(slug)
    }

    @Get(':slug/related')
    related(
        @Param('slug') slug: string,
        @Query() query: RelatedQueryDto,
    ): Promise<PublicProductDto[]> {
        return this.catalog.related(slug, query.limit)
    }
}
