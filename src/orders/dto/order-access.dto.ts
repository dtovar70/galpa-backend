import { IsOptional, IsString } from 'class-validator'

/** `?t=<token>` of the customer's private order link. Checked in the service (404 on mismatch). */
export class OrderAccessQueryDto {
    @IsOptional()
    @IsString()
    t?: string
}
