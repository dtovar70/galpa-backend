import { Transform, Type } from 'class-transformer'
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    Max,
    MaxLength,
    Min,
} from 'class-validator'
import { feminine, masculine, msg } from '../../common/validation/messages.js'
import {
    ORDER_STATUSES,
    REFUND_STATUSES,
    type OrderStatus,
    type RefundStatus,
} from '../order-status.js'
import { ORDER_LIMITS } from './field-names.js'

const FIELD = {
    status: masculine('El estado'),
    refundStatus: masculine('El estado del reembolso'),
    search: feminine('La búsqueda'),
    from: feminine('La fecha desde'),
    to: feminine('La fecha hasta'),
    page: feminine('La página'),
    pageSize: masculine('El tamaño de página'),
} as const

export const ADMIN_ORDERS_PAGE_SIZE = 20
export const ADMIN_ORDERS_MAX_PAGE_SIZE = 100

const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' && value.trim() === '' ? undefined : value

/**
 * `status=A,B`, `status=A&status=B` or both -> `['A', 'B']` (trimmed, without blanks or
 * repeats). Anything that is not text is left for the validators to reject.
 */
export const toStatusList = ({ value }: { value: unknown }): unknown => {
    const parts = Array.isArray(value) ? value : [value]
    if (!parts.every((part) => typeof part === 'string')) return value
    const statuses = [
        ...new Set(
            parts.flatMap((part) =>
                part
                    .split(',')
                    .map((status) => status.trim())
                    .filter(Boolean),
            ),
        ),
    ]
    return statuses.length ? statuses : undefined
}

const INVALID_STATUS = `${msg.invalid(FIELD.status)} Usa uno o varios de ${ORDER_STATUSES.join(', ')}, separados por comas.`

export class AdminOrderQueryDto {
    /** One status or several (`status=A,B` or repeated): orders in any of them. */
    @IsOptional()
    @Transform(toStatusList)
    @IsArray({ message: msg.list(FIELD.status) })
    @ArrayMaxSize(ORDER_STATUSES.length, {
        message: msg.listMaxSize(FIELD.status, ORDER_STATUSES.length),
    })
    @IsIn(ORDER_STATUSES, { each: true, message: INVALID_STATUS })
    status?: OrderStatus[]

    /** `PENDIENTE`: cancelled orders whose money has not been given back yet. */
    @IsOptional()
    @Transform(emptyToUndefined)
    @IsIn(REFUND_STATUSES, { message: msg.invalid(FIELD.refundStatus) })
    refundStatus?: RefundStatus

    /** Code, customer name, phone or payment reference. */
    @IsOptional()
    @Transform(emptyToUndefined)
    @IsString({ message: msg.text(FIELD.search) })
    @MaxLength(ORDER_LIMITS.search, { message: msg.maxLength(FIELD.search, ORDER_LIMITS.search) })
    search?: string

    /** Inclusive calendar days in Caracas time, "YYYY-MM-DD". */
    @IsOptional()
    @Transform(emptyToUndefined)
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: msg.format(FIELD.from, 'AAAA-MM-DD') })
    from?: string

    @IsOptional()
    @Transform(emptyToUndefined)
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: msg.format(FIELD.to, 'AAAA-MM-DD') })
    to?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: msg.integer(FIELD.page) })
    @Min(1, { message: msg.min(FIELD.page, 1) })
    page?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: msg.integer(FIELD.pageSize) })
    @Min(1, { message: msg.min(FIELD.pageSize, 1) })
    @Max(ADMIN_ORDERS_MAX_PAGE_SIZE, {
        message: msg.max(FIELD.pageSize, ADMIN_ORDERS_MAX_PAGE_SIZE),
    })
    pageSize?: number
}
