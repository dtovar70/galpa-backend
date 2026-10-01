import type { PaymentMethod } from '../../common/payment-methods.js'
import { feminine, masculine } from '../../common/validation/messages.js'
import { ID_NUMBER_PATTERN, VE_MOBILE_PATTERN } from '../../common/validation/ve-formats.js'

/** Spanish names of the order fields, used to build validation messages. */
export const ORDER_FIELD = {
    fullName: masculine('El nombre y apellido'),
    email: masculine('El correo'),
    phone: masculine('El teléfono'),
    city: feminine('La ciudad'),
    address: feminine('La dirección'),
    notes: feminine('Las notas'),
    deliveryMethod: masculine('El método de entrega'),
    items: masculine('El carrito'),
    productId: masculine('El producto'),
    variantId: feminine('La variante'),
    quantity: feminine('La cantidad'),
    paymentMethod: masculine('El método de pago'),
    wantsInstallation: feminine('La solicitud de instalación'),
    customerIdNumber: feminine('La cédula o RIF'),
    method: masculine('El método de pago'),
    reference: feminine('La referencia'),
    payerBankCode: masculine('El banco'),
    payerPhone: masculine('El teléfono del pago'),
    payerIdNumber: feminine('La cédula del titular'),
    paidOn: feminine('La fecha del pago'),
    amountBs: masculine('El monto pagado'),
    amountUsd: masculine('El monto pagado en dólares'),
    payerName: masculine('El nombre del titular'),
    payerAccount: feminine('La cuenta desde la que pagaste'),
    reason: masculine('El motivo'),
    note: feminine('La nota'),
    status: masculine('El estado'),
    acknowledgeStockConflict: feminine('La confirmación del stock'),
    forceStock: feminine('La opción de reactivar sin stock'),
    refundStatus: feminine('La respuesta sobre el reembolso'),
    refundReference: feminine('La referencia del reembolso'),
    code: masculine('El código del pedido'),
} as const

export const ORDER_LIMITS = {
    fullName: { min: 3, max: 100 },
    email: 100,
    city: { min: 2, max: 80 },
    address: { min: 6, max: 100 },
    /** Textareas keep larger limits (also CHECKs on their columns). */
    notes: 300,
    items: 50,
    quantity: 99,
    reason: 500,
    note: 1000,
    search: 100,
    refundReference: 60,
} as const

/**
 * Checkout phone: a Venezuelan mobile ("0424-1234567"), since the order notices go out by
 * WhatsApp. The operator code must also be active in `mobile_prefixes` (checked by the service).
 */
export const CUSTOMER_PHONE_PATTERN = VE_MOBILE_PATTERN
/** Pago Móvil phone: "0412-5550134" (same rule as the checkout phone). */
export const PAYER_PHONE_PATTERN = VE_MOBILE_PATTERN
/** Cédula or RIF of the payer or the customer: "V-12345678", "J-123456789". */
export const PAYER_ID_PATTERN = ID_NUMBER_PATTERN

/** Format of the payment reference per method (after dropping spaces, dots and dashes). */
export const REFERENCE_RULES: Record<PaymentMethod, { pattern: RegExp; message: string }> = {
    PAGO_MOVIL: {
        pattern: /^\d{4,12}$/,
        message: 'La referencia del Pago Móvil debe tener entre 4 y 12 dígitos.',
    },
    TRANSFERENCIA: {
        pattern: /^\d{4,20}$/,
        message: 'La referencia de la transferencia debe tener entre 4 y 20 dígitos.',
    },
    ZELLE: {
        pattern: /^[A-Z0-9]{4,40}$/,
        message: 'La confirmación de Zelle debe tener entre 4 y 40 letras o números.',
    },
    BINANCE: {
        pattern: /^[A-Z0-9]{4,64}$/,
        message: 'El ID de la orden de Binance debe tener entre 4 y 64 letras o números.',
    },
}

/** Zelle account: an email or a phone number ("+1 305 555 0134"). */
export const ZELLE_ACCOUNT_PATTERN = /^(?:[^\s@]+@[^\s@]+\.[^\s@]+|\+?[\d\s()-]{7,20})$/
/** Binance account: an email or a Pay ID. */
export const BINANCE_ACCOUNT_PATTERN = /^(?:[^\s@]+@[^\s@]+\.[^\s@]+|[A-Za-z0-9]{4,64})$/

export const ORDER_CODE_PATTERN = /^GP-\d{6,}$/
export const MAX_AMOUNT_BS = 9_999_999_999.99
export const MAX_AMOUNT_USD = 99_999_999.99
