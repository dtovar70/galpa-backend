import { feminine, masculine } from '../../common/validation/messages.js'

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
    personalization: masculine('El texto personalizado'),
    reference: feminine('La referencia'),
    payerBankCode: masculine('El banco'),
    payerPhone: masculine('El teléfono del pago'),
    payerIdNumber: feminine('La cédula del titular'),
    paidOn: feminine('La fecha del pago'),
    amountBs: masculine('El monto pagado'),
    reason: masculine('El motivo'),
    note: feminine('La nota'),
    status: masculine('El estado'),
    acknowledgeStockConflict: feminine('La confirmación del stock'),
    forceStock: feminine('La opción de reactivar sin stock'),
    refundStatus: feminine('La respuesta sobre el reembolso'),
    refundReference: feminine('La referencia del reembolso'),
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
    personalization: 140,
    reason: 500,
    note: 1000,
    search: 100,
    refundReference: 60,
} as const

/** Same shape the checkout form accepts: digits, spaces, "+", "(", ")" and "-". */
export const CUSTOMER_PHONE_PATTERN = /^[\d+\s()-]{7,20}$/
/** Pago Móvil phone: "0412-5550134". */
export const PAYER_PHONE_PATTERN = /^04\d{2}-\d{7}$/
/** Cédula: "V-12345678" / "E-1234567" (RIF prefixes accepted as well). */
export const PAYER_ID_PATTERN = /^[VEJPG]-\d{6,9}$/
export const REFERENCE_PATTERN = /^\d{4,20}$/
export const ORDER_CODE_PATTERN = /^MR-\d{6,}$/
export const MAX_AMOUNT_BS = 9_999_999_999.99
