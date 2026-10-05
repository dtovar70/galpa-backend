import {
    Body,
    Controller,
    Delete,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
} from '@nestjs/common'
import { Role } from '../auth/role.enum.js'
import { Public } from '../common/decorators/public.decorator.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import { BANK_ORDER_ROUTE, BanksService, type AdminBankDto, type BankDto } from './banks.service.js'
import {
    CONTACT_OPTION_ORDER_ROUTE,
    ContactOptionsService,
    type AdminContactOptionDto,
    type ContactOptionsDto,
} from './contact-options.service.js'
import {
    CreateContactOptionDto,
    ReorderContactOptionsDto,
    UpdateContactOptionDto,
} from './dto/contact-option.dto.js'
import { CreateBankDto } from './dto/create-bank.dto.js'
import { CreateMobilePrefixDto } from './dto/create-mobile-prefix.dto.js'
import { ReorderBanksDto } from './dto/reorder-banks.dto.js'
import { ReorderMobilePrefixesDto } from './dto/reorder-mobile-prefixes.dto.js'
import { ReorderPaymentMethodsDto } from './dto/reorder-payment-methods.dto.js'
import { UpdateBankDto } from './dto/update-bank.dto.js'
import { UpdateMobilePrefixDto } from './dto/update-mobile-prefix.dto.js'
import { UpdateOrderStatusGroupDto } from './dto/update-order-status-group.dto.js'
import { UpdateOrderStatusDto } from './dto/update-order-status.dto.js'
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto.js'
import { UpdateQuoteStatusDto } from './dto/update-quote-status.dto.js'
import {
    MOBILE_PREFIX_ORDER_ROUTE,
    MobilePrefixesService,
    type AdminMobilePrefixDto,
    type MobilePrefixDto,
} from './mobile-prefixes.service.js'
import {
    OrderStatusCatalogService,
    type AdminOrderStatusCatalogDto,
    type OrderStatusCatalogDto,
} from './order-status-catalog.service.js'
import {
    PAYMENT_METHOD_ORDER_ROUTE,
    PaymentMethodCatalogService,
    type PaymentMethodCatalogDto,
} from './payment-method-catalog.service.js'
import {
    QuoteStatusCatalogService,
    type QuoteStatusCatalogDto,
} from './quote-status-catalog.service.js'

/**
 * Public catalogs. Like `GET /content`, `no-cache` lets browsers keep a copy but revalidate it
 * on every load; Express adds a weak ETag, so an unchanged catalog costs a 304.
 */
@Public()
@Controller('catalogs')
export class CatalogsController {
    constructor(
        private readonly orderStatuses: OrderStatusCatalogService,
        private readonly banks: BanksService,
        private readonly mobilePrefixes: MobilePrefixesService,
        private readonly paymentMethods: PaymentMethodCatalogService,
        private readonly contactOptions: ContactOptionsService,
    ) {}

    /** Labels, customer copy, badge tones and tabs of the order statuses. */
    @Get('order-statuses')
    @Header('Cache-Control', 'no-cache')
    getOrderStatuses(): Promise<OrderStatusCatalogDto> {
        return this.orderStatuses.getCatalog()
    }

    /** Active banks, in select order. */
    @Get('banks')
    @Header('Cache-Control', 'no-cache')
    getBanks(): Promise<BankDto[]> {
        return this.banks.listActive()
    }

    /** Active mobile operator codes ("0424"), in select order. */
    @Get('mobile-prefixes')
    @Header('Cache-Control', 'no-cache')
    getMobilePrefixes(): Promise<MobilePrefixDto[]> {
        return this.mobilePrefixes.listActive()
    }

    /** Every payment method (name, help text, icon, currency), in checkout order. */
    @Get('payment-methods')
    @Header('Cache-Control', 'no-cache')
    getPaymentMethods(): Promise<PaymentMethodCatalogDto[]> {
        return this.paymentMethods.getCatalog()
    }

    /** Active topics and space types of the contact / advisory form, in form order. */
    @Get('contact-options')
    @Header('Cache-Control', 'no-cache')
    getContactOptions(): Promise<ContactOptionsDto> {
        return this.contactOptions.listActive()
    }
}

/**
 * Catalog editing (ADMIN only). Status codes, their group, position and `isTerminal` are fixed:
 * the order and quote workflows depend on them, so the DTOs do not accept them (400).
 */
@Roles(Role.ADMIN)
@Controller('admin/catalogs')
export class AdminCatalogsController {
    constructor(
        private readonly orderStatuses: OrderStatusCatalogService,
        private readonly quoteStatuses: QuoteStatusCatalogService,
        private readonly banks: BanksService,
        private readonly mobilePrefixes: MobilePrefixesService,
        private readonly paymentMethods: PaymentMethodCatalogService,
        private readonly contactOptions: ContactOptionsService,
    ) {}

    @Get('order-statuses')
    @Header('Cache-Control', 'no-store')
    getOrderStatuses(): Promise<AdminOrderStatusCatalogDto> {
        return this.orderStatuses.getAdminCatalog()
    }

    /** Declared before `order-statuses/:code` for readability; the paths never overlap. */
    @Patch('order-statuses/groups/:code')
    updateGroup(
        @Param('code') code: string,
        @Body() dto: UpdateOrderStatusGroupDto,
    ): Promise<AdminOrderStatusCatalogDto> {
        return this.orderStatuses.updateGroup(code, dto)
    }

    @Patch('order-statuses/:code')
    updateStatus(
        @Param('code') code: string,
        @Body() dto: UpdateOrderStatusDto,
    ): Promise<AdminOrderStatusCatalogDto> {
        return this.orderStatuses.updateStatus(code, dto)
    }

    /** Labels, help texts and badge tones of the quote statuses, in order. EDITOR reads it too. */
    @Get('quote-statuses')
    @Roles(Role.ADMIN, Role.EDITOR)
    @Header('Cache-Control', 'no-store')
    getQuoteStatuses(): Promise<QuoteStatusCatalogDto[]> {
        return this.quoteStatuses.getCatalog()
    }

    @Patch('quote-statuses/:code')
    updateQuoteStatus(
        @Param('code') code: string,
        @Body() dto: UpdateQuoteStatusDto,
    ): Promise<QuoteStatusCatalogDto[]> {
        return this.quoteStatuses.updateStatus(code, dto)
    }

    /** Every payment method (name, help text, icon, currency), in checkout order. */
    @Get('payment-methods')
    @Header('Cache-Control', 'no-store')
    getPaymentMethods(): Promise<PaymentMethodCatalogDto[]> {
        return this.paymentMethods.getCatalog()
    }

    /** Declared before `PATCH payment-methods/:code` so "order" is never taken for a code. */
    @Patch(`payment-methods/${PAYMENT_METHOD_ORDER_ROUTE}`)
    reorderPaymentMethods(
        @Body() dto: ReorderPaymentMethodsDto,
    ): Promise<PaymentMethodCatalogDto[]> {
        return this.paymentMethods.reorder(dto.codes)
    }

    /** Name, help text and icon. The code and its currency are fixed (400). */
    @Patch('payment-methods/:code')
    updatePaymentMethod(
        @Param('code') code: string,
        @Body() dto: UpdatePaymentMethodDto,
    ): Promise<PaymentMethodCatalogDto[]> {
        return this.paymentMethods.update(code, dto)
    }

    @Get('contact-topics')
    @Header('Cache-Control', 'no-store')
    listContactTopics(): Promise<AdminContactOptionDto[]> {
        return this.contactOptions.listForAdmin('topics')
    }

    /** The code is generated from the label ("Soporte técnico" -> SOPORTE_TECNICO). */
    @Post('contact-topics')
    createContactTopic(@Body() dto: CreateContactOptionDto): Promise<AdminContactOptionDto> {
        return this.contactOptions.create('topics', dto)
    }

    @Patch(`contact-topics/${CONTACT_OPTION_ORDER_ROUTE}`)
    reorderContactTopics(@Body() dto: ReorderContactOptionsDto): Promise<AdminContactOptionDto[]> {
        return this.contactOptions.reorder('topics', dto.codes)
    }

    /** `409` when it would leave the form without an active topic. */
    @Patch('contact-topics/:code')
    updateContactTopic(
        @Param('code') code: string,
        @Body() dto: UpdateContactOptionDto,
    ): Promise<AdminContactOptionDto> {
        return this.contactOptions.update('topics', code, dto)
    }

    /** `409` when it is the only active topic. */
    @Delete('contact-topics/:code')
    @HttpCode(HttpStatus.NO_CONTENT)
    removeContactTopic(@Param('code') code: string): Promise<void> {
        return this.contactOptions.remove('topics', code)
    }

    @Get('space-types')
    @Header('Cache-Control', 'no-store')
    listSpaceTypes(): Promise<AdminContactOptionDto[]> {
        return this.contactOptions.listForAdmin('spaceTypes')
    }

    @Post('space-types')
    createSpaceType(@Body() dto: CreateContactOptionDto): Promise<AdminContactOptionDto> {
        return this.contactOptions.create('spaceTypes', dto)
    }

    @Patch(`space-types/${CONTACT_OPTION_ORDER_ROUTE}`)
    reorderSpaceTypes(@Body() dto: ReorderContactOptionsDto): Promise<AdminContactOptionDto[]> {
        return this.contactOptions.reorder('spaceTypes', dto.codes)
    }

    @Patch('space-types/:code')
    updateSpaceType(
        @Param('code') code: string,
        @Body() dto: UpdateContactOptionDto,
    ): Promise<AdminContactOptionDto> {
        return this.contactOptions.update('spaceTypes', code, dto)
    }

    @Delete('space-types/:code')
    @HttpCode(HttpStatus.NO_CONTENT)
    removeSpaceType(@Param('code') code: string): Promise<void> {
        return this.contactOptions.remove('spaceTypes', code)
    }

    @Get('banks')
    @Header('Cache-Control', 'no-store')
    listBanks(): Promise<AdminBankDto[]> {
        return this.banks.listForAdmin()
    }

    @Post('banks')
    createBank(@Body() dto: CreateBankDto): Promise<AdminBankDto> {
        return this.banks.create(dto)
    }

    /** Declared before `PATCH banks/:code` so "order" is never taken for a code. */
    @Patch(`banks/${BANK_ORDER_ROUTE}`)
    reorderBanks(@Body() dto: ReorderBanksDto): Promise<AdminBankDto[]> {
        return this.banks.reorder(dto.codes)
    }

    @Patch('banks/:code')
    updateBank(@Param('code') code: string, @Body() dto: UpdateBankDto): Promise<AdminBankDto> {
        return this.banks.update(code, dto)
    }

    /** `409` while a payment or the store's payment details use the bank: deactivate it instead. */
    @Delete('banks/:code')
    @HttpCode(HttpStatus.NO_CONTENT)
    removeBank(@Param('code') code: string): Promise<void> {
        return this.banks.remove(code)
    }

    @Get('mobile-prefixes')
    @Header('Cache-Control', 'no-store')
    listMobilePrefixes(): Promise<AdminMobilePrefixDto[]> {
        return this.mobilePrefixes.listForAdmin()
    }

    @Post('mobile-prefixes')
    createMobilePrefix(@Body() dto: CreateMobilePrefixDto): Promise<AdminMobilePrefixDto> {
        return this.mobilePrefixes.create(dto)
    }

    /** Declared before `PATCH mobile-prefixes/:code` so "order" is never taken for a code. */
    @Patch(`mobile-prefixes/${MOBILE_PREFIX_ORDER_ROUTE}`)
    reorderMobilePrefixes(@Body() dto: ReorderMobilePrefixesDto): Promise<AdminMobilePrefixDto[]> {
        return this.mobilePrefixes.reorder(dto.codes)
    }

    @Patch('mobile-prefixes/:code')
    updateMobilePrefix(
        @Param('code') code: string,
        @Body() dto: UpdateMobilePrefixDto,
    ): Promise<AdminMobilePrefixDto> {
        return this.mobilePrefixes.update(code, dto)
    }

    /** `409` while an order in progress or the store content uses the code: deactivate it. */
    @Delete('mobile-prefixes/:code')
    @HttpCode(HttpStatus.NO_CONTENT)
    removeMobilePrefix(@Param('code') code: string): Promise<void> {
        return this.mobilePrefixes.remove(code)
    }
}
