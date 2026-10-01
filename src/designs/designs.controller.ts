import {
    Body,
    Controller,
    Get,
    Param,
    Post,
    Query,
    Res,
    UploadedFiles,
    UseFilters,
    UseInterceptors,
} from '@nestjs/common'
import { FileFieldsInterceptor } from '@nestjs/platform-express'
import { Throttle } from '@nestjs/throttler'
import type { Response } from 'express'
import { Public } from '../common/decorators/public.decorator.js'
import { OrderAccessQueryDto } from '../orders/dto/order-access.dto.js'
import {
    ARTWORK_FIELD,
    DESIGN_UPLOAD_FIELDS,
    DESIGN_UPLOAD_OPTIONS,
    DesignUploadErrorsFilter,
    ORIGINALS_FIELD,
    PREVIEW_FIELD,
} from './design-upload.js'
import { sendPrivateFile } from './send-private-file.js'
import { DesignsService, type CreatedDesignDto } from './designs.service.js'
import { CreateDesignDto } from './dto/create-design.dto.js'

/** Per client IP: 20 design uploads per hour. */
export const DESIGN_UPLOAD_LIMIT = { default: { limit: 20, ttl: 60 * 60_000 } }

export type DesignFiles = Partial<
    Record<
        typeof ORIGINALS_FIELD | typeof ARTWORK_FIELD | typeof PREVIEW_FIELD,
        Express.Multer.File[]
    >
>

/**
 * "Diseña con tu imagen" for guests. The upload returns a random preview token (only its hash
 * is stored): the cart keeps `/designs/<id>/preview?t=<token>`, so whoever holds the cart sees
 * the preview and nobody else can guess it. A wrong token is a plain 404.
 */
@Public()
@Controller('designs')
export class DesignsController {
    constructor(private readonly designs: DesignsService) {}

    /**
     * multipart/form-data: `originals` (0–5 JPG/PNG/WEBP, 10 MB each, one per image layer),
     * `artwork` (PNG, 25 MB), `preview` (PNG, 2 MB), `productId`, `variantId?`,
     * `templateColorId?` and `layers` (JSON, see RequestedLayer).
     */
    @Post()
    @Throttle(DESIGN_UPLOAD_LIMIT)
    @UseFilters(DesignUploadErrorsFilter)
    @UseInterceptors(FileFieldsInterceptor(DESIGN_UPLOAD_FIELDS, DESIGN_UPLOAD_OPTIONS))
    create(
        @Body() dto: CreateDesignDto,
        @UploadedFiles() files: DesignFiles | undefined,
    ): Promise<CreatedDesignDto> {
        return this.designs.create(dto, {
            originals: files?.originals ?? [],
            artwork: files?.artwork?.[0],
            preview: files?.preview?.[0],
        })
    }

    /** The mockup preview (a stream, or a redirect to a URL signed for a few minutes). */
    @Get(':id/preview')
    async preview(
        @Param('id') id: string,
        @Query() query: OrderAccessQueryDto,
        @Res() res: Response,
    ): Promise<void> {
        sendPrivateFile(res, await this.designs.previewForToken(id, query.t))
    }
}
