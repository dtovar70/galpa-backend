import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Query,
    Res,
    UploadedFile,
    UseFilters,
    UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Throttle } from '@nestjs/throttler'
import type { Response } from 'express'
import { Public } from '../common/decorators/public.decorator.js'
import { CreateOrderDto } from './dto/create-order.dto.js'
import { OrderAccessQueryDto, OrderLookupDto } from './dto/order-access.dto.js'
import { ORDER_LOOKUP_REQUESTED, OrderLookupService } from './emails/order-lookup.service.js'
import { SubmitPaymentDto } from './dto/submit-payment.dto.js'
import type { PublicOrderDto } from './order.mapper.js'
import { OrdersService, type CreatedOrderDto } from './orders.service.js'
import { sendReceipt } from './receipt/send-receipt.js'
import { ReceiptService } from './receipt/receipt.service.js'
import { PROOF_FIELD, PROOF_UPLOAD_OPTIONS, ProofUploadErrorsFilter } from './payment-upload.js'

/** Per client IP: 10 new orders / payment proofs every 10 minutes. */
const WRITE_LIMIT = { default: { limit: 10, ttl: 10 * 60_000 } }
/** Per client IP: 20 receipt PDFs every 10 minutes (each one is rendered on request). */
const RECEIPT_LIMIT = { default: { limit: 20, ttl: 10 * 60_000 } }
/** Per client IP: 5 "Consultar mi pedido" requests every 15 minutes. */
const LOOKUP_LIMIT = { default: { limit: 5, ttl: 15 * 60_000 } }

/**
 * Guest checkout. Customers never log in: each order has a private link with a random token
 * (`?t=`); a wrong or missing token is answered like an unknown order (404).
 */
@Public()
@Controller('orders')
export class OrdersController {
    constructor(
        private readonly orders: OrdersService,
        private readonly receipts: ReceiptService,
        private readonly lookups: OrderLookupService,
    ) {}

    @Post()
    @Throttle(WRITE_LIMIT)
    create(@Body() dto: CreateOrderDto): Promise<CreatedOrderDto> {
        return this.orders.create(dto)
    }

    /**
     * "Consultar mi pedido": always 202 with the same body. When the code and the email match an
     * order, a fresh private link is emailed to the order's address (in the background). 429 past
     * 3 lookups per email or per code (and 5 per IP) every 15 minutes.
     */
    @Post('lookup')
    @HttpCode(HttpStatus.ACCEPTED)
    @Throttle(LOOKUP_LIMIT)
    @Header('Cache-Control', 'no-store')
    lookup(@Body() dto: OrderLookupDto): { message: string } {
        this.lookups.request(dto.code, dto.email)
        return { message: ORDER_LOOKUP_REQUESTED }
    }

    /**
     * The purchase receipt ("Comprobante de compra") as a PDF download. 404 like the order page
     * for a wrong token; 409 until the payment is verified, and for a cancelled order. Declared
     * before `:code` for readability; the paths never overlap.
     */
    @Get(':code/receipt.pdf')
    @Throttle(RECEIPT_LIMIT)
    async receipt(
        @Param('code') code: string,
        @Query() query: OrderAccessQueryDto,
        @Res() res: Response,
    ): Promise<void> {
        sendReceipt(res, await this.receipts.forCustomer(code, query.t))
    }

    @Get(':code')
    @Header('Cache-Control', 'no-store')
    @Header('Referrer-Policy', 'no-referrer')
    get(@Param('code') code: string, @Query() query: OrderAccessQueryDto): Promise<PublicOrderDto> {
        return this.orders.getForCustomer(code, query.t)
    }

    /** multipart/form-data: the text fields of SubmitPaymentDto plus an optional `proof` image. */
    @Post(':code/payment')
    @HttpCode(HttpStatus.OK)
    @Throttle(WRITE_LIMIT)
    @Header('Cache-Control', 'no-store')
    @UseFilters(ProofUploadErrorsFilter)
    @UseInterceptors(FileInterceptor(PROOF_FIELD, PROOF_UPLOAD_OPTIONS))
    submitPayment(
        @Param('code') code: string,
        @Query() query: OrderAccessQueryDto,
        @Body() dto: SubmitPaymentDto,
        @UploadedFile() file: Express.Multer.File | undefined,
    ): Promise<PublicOrderDto> {
        return this.orders.submitPayment(code, query.t, dto, file)
    }
}
