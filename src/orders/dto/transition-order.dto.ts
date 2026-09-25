import { Transform, type TransformFnParams } from 'class-transformer'
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import {
    ORDER_STATUSES,
    REFUND_STATUSES,
    type OrderStatus,
    type RefundStatus,
} from '../order-status.js'
import { ORDER_FIELD as FIELD, ORDER_LIMITS as LIMITS } from './field-names.js'

const trimOrUndefined = ({ value }: TransformFnParams): unknown => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
}

/** Body of `POST /admin/orders/:code/transitions`. */
export class TransitionOrderDto {
    @IsIn(ORDER_STATUSES, { message: msg.invalid(FIELD.status) })
    to: OrderStatus

    /** Required when rejecting a payment or cancelling; tracking/agency when shipping. */
    @IsOptional()
    @Transform(trimOrUndefined)
    @IsString({ message: msg.text(FIELD.reason) })
    @MaxLength(LIMITS.reason, { message: msg.maxLength(FIELD.reason, LIMITS.reason) })
    note?: string

    /** Confirming a payment of an order that lacks stock: the admin says they know. */
    @IsOptional()
    @IsBoolean({ message: msg.boolean(FIELD.acknowledgeStockConflict) })
    acknowledgeStockConflict?: boolean

    /** Reactivating without enough stock (flagged as a stock conflict). */
    @IsOptional()
    @IsBoolean({ message: msg.boolean(FIELD.forceStock) })
    forceStock?: boolean

    /** Cancelling an order with a pending or verified payment: must money be given back? */
    @IsOptional()
    @IsIn(REFUND_STATUSES, { message: 'Indica si hay que devolver dinero al cliente.' })
    refundStatus?: RefundStatus

    /** Bank reference, when the refund was already made (`REEMBOLSADO`). */
    @IsOptional()
    @Transform(trimOrUndefined)
    @IsString({ message: msg.text(FIELD.refundReference) })
    @MaxLength(LIMITS.refundReference, {
        message: msg.maxLength(FIELD.refundReference, LIMITS.refundReference),
    })
    refundReference?: string
}

/** Body of `POST /admin/orders/:code/refund`: the refund was made. */
export class MarkRefundedDto {
    @IsOptional()
    @Transform(trimOrUndefined)
    @IsString({ message: msg.text(FIELD.refundReference) })
    @MaxLength(LIMITS.refundReference, {
        message: msg.maxLength(FIELD.refundReference, LIMITS.refundReference),
    })
    reference?: string
}

/** Body of `POST /admin/orders/:code/notes`. */
export class AddOrderNoteDto {
    @Transform(({ value }: TransformFnParams): unknown =>
        typeof value === 'string' ? value.trim() : value,
    )
    @IsString({ message: msg.text(FIELD.note) })
    @IsNotEmpty({ message: msg.required(FIELD.note) })
    @MaxLength(LIMITS.note, { message: msg.maxLength(FIELD.note, LIMITS.note) })
    body: string
}
