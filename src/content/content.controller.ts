import {
    Body,
    Controller,
    Get,
    Header,
    HttpCode,
    HttpStatus,
    Param,
    Post,
    Put,
} from '@nestjs/common'
import { Role } from '../auth/role.enum.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import { Public } from '../common/decorators/public.decorator.js'
import { Roles } from '../common/decorators/roles.decorator.js'
import type { AuthUser } from '../common/types/auth-user.js'
import {
    ContentService,
    type AdminContentDto,
    type AdminContentSectionDto,
} from './content.service.js'
import type { SiteContent } from './content.types.js'

/**
 * Public site content. `no-cache` lets browsers keep a copy but revalidate it on every load;
 * Express adds a weak ETag, so an unchanged payload costs a 304. Edits show up immediately.
 */
@Public()
@Controller('content')
export class ContentController {
    constructor(private readonly content: ContentService) {}

    @Get()
    @Header('Cache-Control', 'no-cache')
    getAll(): Promise<SiteContent> {
        return this.content.getAll()
    }
}

@Roles(Role.ADMIN, Role.EDITOR)
@Controller('admin/content')
export class AdminContentController {
    constructor(private readonly content: ContentService) {}

    @Get()
    @Header('Cache-Control', 'no-store')
    getAll(): Promise<AdminContentDto> {
        return this.content.getAllForAdmin()
    }

    /**
     * Replaces the whole section. The body is validated by the section's DTO inside the
     * service (the DTO depends on `:section`); an unknown section is a 404.
     */
    @Put(':section')
    update(
        @Param('section') section: string,
        @Body() body: unknown,
        @CurrentUser() user: AuthUser,
    ): Promise<AdminContentSectionDto> {
        return this.content.update(section, body, user)
    }

    /** Restores the built-in texts of a section. */
    @Roles(Role.ADMIN)
    @Post(':section/reset')
    @HttpCode(HttpStatus.OK)
    reset(@Param('section') section: string): Promise<AdminContentSectionDto> {
        return this.content.reset(section)
    }
}
