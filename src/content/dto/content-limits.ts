/**
 * Lengths, list sizes and formats of the editable content. Mirrored by the admin forms in
 * frontend-cups/src/views/admin/content/schema/content.schema.ts.
 */
export const CONTENT_LIMITS = {
    /** Button labels, badges, eyebrows, short list items. */
    label: 40,
    title: 90,
    /** Titles of list items (steps, values). */
    itemTitle: 60,
    question: 120,
    /** Subtitles and descriptions. */
    text: 300,
    /** Paragraphs and FAQ answers. */
    paragraph: 1000,
    brandName: 60,
    tagline: 80,
    titleSuffix: 70,
    metaDescription: 300,
    announcement: 80,
    searchPlaceholder: 60,
    statValue: 12,
    email: 120,
    city: 80,
    schedule: 120,
    bankName: 60,
    holderName: 80,
    instructions: 500,
} as const

export const CONTENT_LIST_SIZES = {
    announcements: { minItems: 1, maxItems: 8 },
    heroFeatures: { minItems: 0, maxItems: 4 },
    steps: { minItems: 1, maxItems: 6 },
    paragraphs: { minItems: 1, maxItems: 6 },
    values: { minItems: 1, maxItems: 8 },
    stats: { minItems: 1, maxItems: 8 },
    faq: { minItems: 1, maxItems: 12 },
} as const

/** Any Venezuelan number, landlines included: "0412-5550134", "0253-1234567". */
export const VE_PHONE_PATTERN = /^0\d{3}-\d{7}$/
/** Venezuelan mobile number (WhatsApp, Pago Móvil): "0412-5550134". */
export const VE_MOBILE_PATTERN = /^04\d{2}-\d{7}$/
/** Cédula or RIF: "V-12345678", "J-123456789". */
export const ID_NUMBER_PATTERN = /^[VEJPG]-\d{6,9}$/
export const BANK_CODE_PATTERN = /^\d{4}$/
/** Instagram / TikTok handle without "@"; empty hides the link. */
export const SOCIAL_HANDLE_PATTERN = /^(?:[A-Za-z0-9._]{1,30})?$/
