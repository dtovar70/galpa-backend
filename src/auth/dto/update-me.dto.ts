import { IsUserName } from './user-fields.js'

/** `PATCH /auth/me`: what a user may change about themselves (email and role are ADMIN's). */
export class UpdateMeDto {
    @IsUserName()
    name: string
}
