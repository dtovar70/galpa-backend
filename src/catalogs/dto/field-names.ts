import { feminine, masculine } from '../../common/validation/messages.js'

/** Longest status or group code ("PENDIENTE_VERIFICACION"). */
export const CATALOG_CODE_MAX_LENGTH = 40
/** Longest group description and customer message. */
export const CATALOG_DESCRIPTION_MAX_LENGTH = 300
export const CATALOG_SORT_ORDER_MAX = 9999
/** Longest WhatsApp message template of a status (a textarea; also a CHECK on the column). */
export const WHATSAPP_TEMPLATE_MAX_LENGTH = 1000

/** Spanish names of the catalog fields, used to build validation messages. */
export const CATALOG_FIELD = {
    statusLabel: masculine('El nombre del estado'),
    customerLabel: masculine('El nombre para el cliente'),
    customerTitle: masculine('El título del mensaje al cliente'),
    customerDescription: masculine('El mensaje al cliente'),
    tone: masculine('El color'),
    whatsappTemplate: masculine('El mensaje de WhatsApp'),
    groupLabel: masculine('El nombre de la pestaña'),
    groupDescription: feminine('La descripción de la pestaña'),
    sortOrder: feminine('La posición'),
    bankCode: masculine('El código del banco'),
    bankName: masculine('El nombre del banco'),
    isActive: masculine('El estado del banco'),
    bankCodes: feminine('La lista de bancos'),
    mobilePrefixCode: masculine('El código de celular'),
    mobilePrefixActive: masculine('El estado del código'),
    mobilePrefixCodes: feminine('La lista de códigos'),
} as const
