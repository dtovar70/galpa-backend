import { feminine, masculine } from '../../common/validation/messages.js'

/** Spanish names of the quote fields, used to build validation messages. */
export const QUOTE_FIELD = {
    customerName: masculine('El nombre del cliente'),
    customerEmail: masculine('El correo del cliente'),
    customerPhone: masculine('El teléfono del cliente'),
    customerIdNumber: feminine('La cédula o RIF del cliente'),
    customerCompany: feminine('La empresa del cliente'),
    notes: feminine('Las notas'),
    terms: feminine('Las condiciones'),
    validUntil: feminine('La fecha de vigencia'),
    discount: masculine('El descuento'),
    items: feminine('La lista de productos'),
    productId: masculine('El producto'),
    variantId: feminine('La variante'),
    description: feminine('La descripción'),
    brand: feminine('La marca'),
    model: masculine('El modelo'),
    quantity: feminine('La cantidad'),
    unitPrice: masculine('El precio unitario'),
    status: masculine('El estado'),
    reason: masculine('El motivo'),
    search: feminine('La búsqueda'),
    page: feminine('La página'),
    deliveryMethod: masculine('El método de entrega'),
    paymentMethod: masculine('El método de pago'),
    address: feminine('La dirección'),
    city: feminine('La ciudad'),
} as const

export const QUOTE_LIMITS = {
    customerName: { min: 3, max: 100 },
    email: 100,
    company: 100,
    /** Textareas (also CHECKs on their columns). */
    notes: 1000,
    terms: 2000,
    items: 50,
    description: 300,
    quantity: 9999,
    reason: 500,
    search: 100,
} as const

export const QUOTE_CODE_PATTERN = /^COT-\d{6,}$/
export const MAX_QUOTE_PRICE = 99_999_999.99
export const QUOTES_PAGE_SIZE = 10
