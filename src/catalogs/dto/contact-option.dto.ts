import { PartialType } from '@nestjs/mapped-types'
import {
    ArrayMaxSize,
    ArrayUnique,
    IsArray,
    IsBoolean,
    IsNotEmpty,
    IsOptional,
    IsString,
} from 'class-validator'
import { msg } from '../../common/validation/messages.js'
import { MaxInputLength } from '../../common/validation/text-limits.js'
import { CATALOG_FIELD as FIELD, CONTACT_OPTIONS_MAX } from './field-names.js'
import { Trim } from './trim.js'

/** A new contact topic or space type. Its code is generated from the label by the service. */
export class CreateContactOptionDto {
    @Trim()
    @IsString({ message: msg.text(FIELD.contactOptionLabel) })
    @IsNotEmpty({ message: msg.required(FIELD.contactOptionLabel) })
    @MaxInputLength(FIELD.contactOptionLabel)
    label: string

    @IsOptional()
    @IsBoolean({ message: msg.boolean(FIELD.contactOptionActive) })
    isActive?: boolean
}

/** Rename or (de)activate an option. The code is its identity and cannot change. */
export class UpdateContactOptionDto extends PartialType(CreateContactOptionDto) {}

export class ReorderContactOptionsDto {
    /** Every code of the list, in the order the form shows them. */
    @IsArray({ message: msg.list(FIELD.contactOptionCodes) })
    @ArrayUnique({ message: msg.listUnique(FIELD.contactOptionCodes) })
    @ArrayMaxSize(CONTACT_OPTIONS_MAX, {
        message: msg.listMaxSize(FIELD.contactOptionCodes, CONTACT_OPTIONS_MAX),
    })
    @IsString({ each: true, message: 'Cada código de opción debe ser un texto.' })
    codes: string[]
}
