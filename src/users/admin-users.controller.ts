import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
} from '@nestjs/common'
import { Role } from '../auth/role.enum.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import type { AuthUser } from '../common/types/auth-user.js'
import type { Paginated } from '../products/product.mapper.js'
import {
    AdminUsersService,
    type AdminUserDto,
    type SetUserActiveResultDto,
} from './admin-users.service.js'
import { CreateUserDto } from './dto/create-user.dto.js'
import { SetUserActiveDto } from './dto/set-user-active.dto.js'
import { SetUserPasswordDto } from './dto/set-user-password.dto.js'
import { UpdateUserDto } from './dto/update-user.dto.js'
import { UserQueryDto } from './dto/user-query.dto.js'

/** Admin user management ("Usuarios"). ADMIN only. There is no delete: deactivate instead. */
@Roles(Role.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
    constructor(private readonly users: AdminUsersService) {}

    @Get()
    @Header('Cache-Control', 'no-store')
    list(@Query() query: UserQueryDto): Promise<Paginated<AdminUserDto>> {
        return this.users.list(query)
    }

    @Get(':id')
    @Header('Cache-Control', 'no-store')
    get(@Param('id') id: string): Promise<AdminUserDto> {
        return this.users.get(id)
    }

    @Post()
    create(@Body() dto: CreateUserDto): Promise<AdminUserDto> {
        return this.users.create(dto)
    }

    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() dto: UpdateUserDto,
        @CurrentUser() actor: AuthUser,
    ): Promise<AdminUserDto> {
        return this.users.update(id, dto, actor)
    }

    /** Sets a new password and closes every session of that user. */
    @Post(':id/password')
    @HttpCode(HttpStatus.NO_CONTENT)
    setPassword(
        @Param('id') id: string,
        @Body() dto: SetUserPasswordDto,
        @CurrentUser() actor: AuthUser,
    ): Promise<void> {
        return this.users.setPassword(id, dto.password, actor)
    }

    @Patch(':id/active')
    setActive(
        @Param('id') id: string,
        @Body() dto: SetUserActiveDto,
        @CurrentUser() actor: AuthUser,
    ): Promise<SetUserActiveResultDto> {
        return this.users.setActive(id, dto.isActive, actor)
    }
}
