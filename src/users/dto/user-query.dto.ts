import { Transform, Type } from 'class-transformer'
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'
import { feminine, masculine, msg } from '../../common/validation/messages.js'
import { MaxInputLength } from '../../common/validation/text-limits.js'
import { toTrimmedString } from '../../products/dto/query-transforms.js'

export const USERS_DEFAULT_PAGE_SIZE = 20
export const USERS_MAX_PAGE_SIZE = 100

const SEARCH = feminine('La búsqueda')
const PAGE = feminine('La página')
const PAGE_SIZE = masculine('El tamaño de página')

/** `GET /admin/users?search&page&pageSize` (search: name or email, case-insensitive). */
export class UserQueryDto {
    @IsOptional()
    @Transform(toTrimmedString)
    @IsString({ message: msg.text(SEARCH) })
    @MaxInputLength(SEARCH)
    search?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: msg.integer(PAGE) })
    @Min(1, { message: msg.min(PAGE, 1) })
    page: number = 1

    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: msg.integer(PAGE_SIZE) })
    @Min(1, { message: msg.min(PAGE_SIZE, 1) })
    @Max(USERS_MAX_PAGE_SIZE, { message: msg.max(PAGE_SIZE, USERS_MAX_PAGE_SIZE) })
    pageSize: number = USERS_DEFAULT_PAGE_SIZE
}
