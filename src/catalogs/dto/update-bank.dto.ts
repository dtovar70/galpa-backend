import { OmitType, PartialType } from '@nestjs/mapped-types'
import { CreateBankDto } from './create-bank.dto.js'

/** Rename or (de)activate a bank. The code is its identity and cannot change. */
export class UpdateBankDto extends PartialType(OmitType(CreateBankDto, ['code'] as const)) {}
