import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Put,
    Query,
    Res,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Response } from 'express'
import { Role } from '../auth/role.enum.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { Public } from '../common/decorators/public.decorator.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import type { AuthUser } from '../common/types/auth-user.js'
import { OrderAccessQueryDto } from '../orders/dto/order-access.dto.js'
import { sendPdf } from '../common/http/send-pdf.js'
import { ConvertQuoteDto, QuoteQueryDto, QuoteStatusDto, SaveQuoteDto } from './dto/quote.dto.js'
import type { QuoteDto, QuoteListDto } from './quote.mapper.js'
import { QuotesService, type QuoteWhatsAppDto } from './quotes.service.js'

/** Per client IP: 20 quote PDFs every 10 minutes (each one is rendered on request). */
const PDF_LIMIT = { default: { limit: 20, ttl: 10 * 60_000 } }

/** Back office: quotes ("Cotizaciones"), for ADMIN and EDITOR. */
@Roles(Role.ADMIN, Role.EDITOR)
@Controller('admin/quotes')
export class AdminQuotesController {
    constructor(private readonly quotes: QuotesService) {}

    @Get()
    @Header('Cache-Control', 'no-store')
    list(@Query() query: QuoteQueryDto): Promise<QuoteListDto> {
        return this.quotes.list(query)
    }

    @Get(':code')
    @Header('Cache-Control', 'no-store')
    get(@Param('code') code: string): Promise<QuoteDto> {
        return this.quotes.get(code)
    }

    @Post()
    create(@Body() dto: SaveQuoteDto, @CurrentUser() user: AuthUser): Promise<QuoteDto> {
        return this.quotes.create(dto, user)
    }

    /** Replaces the whole quote; only while BORRADOR or ENVIADA (409 otherwise). */
    @Put(':code')
    update(@Param('code') code: string, @Body() dto: SaveQuoteDto): Promise<QuoteDto> {
        return this.quotes.update(code, dto)
    }

    /** `{ status, reason? }`: one allowed status change (see QUOTE_TRANSITIONS). */
    @Post(':code/status')
    @HttpCode(HttpStatus.OK)
    changeStatus(@Param('code') code: string, @Body() dto: QuoteStatusDto): Promise<QuoteDto> {
        return this.quotes.changeStatus(code, dto)
    }

    @Get(':code/pdf')
    async pdf(@Param('code') code: string, @Res() res: Response): Promise<void> {
        sendPdf(res, await this.quotes.pdf(code))
    }

    /** Emails the PDF to the customer and marks the quote ENVIADA. */
    @Post(':code/send')
    @HttpCode(HttpStatus.OK)
    send(@Param('code') code: string): Promise<QuoteDto> {
        return this.quotes.send(code)
    }

    /** `{ message, url, pdfUrl }`: the WhatsApp text with a public PDF link (`url` is wa.me). */
    @Post(':code/whatsapp-message')
    @HttpCode(HttpStatus.OK)
    @Header('Cache-Control', 'no-store')
    whatsappMessage(@Param('code') code: string): Promise<QuoteWhatsAppDto> {
        return this.quotes.whatsappMessage(code)
    }

    /** `{ deliveryMethod, paymentMethod, address?, city? }` → `{ orderCode, customerUrl }`. */
    @Post(':code/convert')
    @HttpCode(HttpStatus.OK)
    @Header('Cache-Control', 'no-store')
    convert(
        @Param('code') code: string,
        @Body() dto: ConvertQuoteDto,
        @CurrentUser() user: AuthUser,
    ): Promise<{ orderCode: string; customerUrl: string }> {
        return this.quotes.convert(code, dto, user)
    }

    /** Only drafts. */
    @Delete(':code')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(@Param('code') code: string): Promise<void> {
        return this.quotes.remove(code)
    }
}

/** The quote PDF behind its private link (`?t=`); a wrong token is a plain 404. */
@Public()
@Controller('quotes')
export class QuotesController {
    constructor(private readonly quotes: QuotesService) {}

    @Get(':code/pdf')
    @Throttle(PDF_LIMIT)
    async pdf(
        @Param('code') code: string,
        @Query() query: OrderAccessQueryDto,
        @Res() res: Response,
    ): Promise<void> {
        sendPdf(res, await this.quotes.publicPdf(code, query.t), 'inline')
    }
}
