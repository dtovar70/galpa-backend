/**
 * Editable site content: one JSON value per section, stored in `site_content`.
 *
 * Mirrored in frontend-galpa/src/@types/content.ts. Keep both files identical (only the
 * comments that point at each other differ), so the storefront and the API agree on the shape.
 *
 * Text conventions shared by the API and the storefront:
 * - Highlighted words (painted green in headings) are wrapped in asterisks: "Tus *favoritos*".
 * - Placeholders in braces are replaced when rendered, e.g. "{envioGratis}" -> "$35". Each field
 *   accepts only the placeholders listed in `CONTENT_PLACEHOLDERS`.
 */

import { PAYMENT_METHODS, type PaymentMethod } from '../common/payment-methods.js'

export const CONTENT_SECTIONS = [
    'general',
    'home',
    'about',
    'contact',
    'contactPage',
    'shipping',
    'payment',
] as const

export type ContentSection = (typeof CONTENT_SECTIONS)[number]

export function isContentSection(value: string): value is ContentSection {
    return (CONTENT_SECTIONS as readonly string[]).includes(value)
}

/** Placeholders and what they render. */
export const CONTENT_PLACEHOLDERS = {
    /** Free-shipping threshold, as money: "$35". */
    envioGratis: '{envioGratis}',
    /** Flat shipping rate, as money: "$4". */
    tarifaEnvio: '{tarifaEnvio}',
    /** Dispatch-time copy of the shipping section. */
    despacho: '{despacho}',
    /** Number of categories in words: "Tres formatos". */
    categorias: '{categorias}',
    /** Brand name of the general section. */
    marca: '{marca}',
    /** City of the contact section. */
    ciudad: '{ciudad}',
} as const

export type ContentPlaceholder = keyof typeof CONTENT_PLACEHOLDERS

/** Icons a brand value on the About page can use (lucide icons on the storefront). */
export const ABOUT_VALUE_ICONS = [
    'air-vent',
    'snowflake',
    'wrench',
    'heart-handshake',
    'timer',
    'star',
    'truck',
    'shield-check',
] as const

export type AboutValueIcon = (typeof ABOUT_VALUE_ICONS)[number]

export interface GeneralContent {
    brandName: string
    tagline: string
    /** Short description shown in the footer. */
    description: string
    /** document.title is "<brandName> — <titleSuffix>" (just the brand when empty). */
    titleSuffix: string
    /** `<meta name="description">`. Accepts {envioGratis}. */
    metaDescription: string
    searchPlaceholder: string
}

export interface HomeStep {
    title: string
    description: string
}

/** A real customer review shown on the home page. */
export interface HomeTestimonial {
    quote: string
    name: string
    /** Empty hides it. */
    city: string
    /** What the customer bought, free text. Empty hides it. */
    product: string
}

export interface HomeContent {
    heroBadge: string
    /** Accepts *highlights*. */
    heroTitle: string
    heroSubtitle: string
    heroPrimaryCta: string
    heroSecondaryCta: string
    heroFeatures: string[]
    categoriesEyebrow: string
    categoriesTitle: string
    /** Accepts {categorias}. */
    categoriesDescription: string
    featuredEyebrow: string
    featuredTitle: string
    featuredDescription: string
    featuredCta: string
    stepsEyebrow: string
    stepsTitle: string
    stepsDescription: string
    steps: HomeStep[]
    testimonialsEyebrow: string
    testimonialsTitle: string
    /** Real reviews, in order. Empty hides the whole section. */
    testimonials: HomeTestimonial[]
    ctaBadge: string
    ctaTitle: string
    ctaDescription: string
    ctaPrimary: string
    ctaSecondary: string
}

export interface AboutValue {
    icon: AboutValueIcon
    title: string
    description: string
}

export interface AboutStat {
    value: string
    label: string
}

export interface AboutContent {
    badge: string
    title: string
    /** Accept {marca} and {ciudad}. The first one is set larger. */
    paragraphs: string[]
    ctaLabel: string
    imageBadge: string
    valuesEyebrow: string
    valuesTitle: string
    valuesDescription: string
    values: AboutValue[]
    statsEyebrow: string
    statsTitle: string
    stats: AboutStat[]
}

export interface ContactContent {
    email: string
    /** Venezuelan number, "0412-5550134". Shown as "+58 412 555 0134". */
    phone: string
    /** Mobile number for wa.me links, "0412-5550134". */
    whatsapp: string
    city: string
    schedule: string
    /** Handles without "@"; empty hides the link. */
    instagram: string
    tiktok: string
}

export interface FaqItem {
    question: string
    answer: string
}

export interface ContactPageContent {
    badge: string
    title: string
    intro: string
    faqEyebrow: string
    faqTitle: string
    /** Accept {envioGratis}, {tarifaEnvio} and {despacho}. */
    faq: FaqItem[]
}

export interface ShippingContent {
    /** USD. Orders at or above it ship free. */
    freeThreshold: number
    /** USD charged below the threshold. */
    flatRate: number
    /** Accepts {envioGratis}. */
    freeShippingCopy: string
    /** How long an order takes to leave the store ("Despachamos en 24 a 48 horas hábiles"). */
    dispatchCopy: string
}

export interface PagoMovilContent {
    enabled: boolean
    /** Four-digit bank code, "0102". */
    bankCode: string
    bankName: string
    phone: string
    /** Cédula or RIF, "V-12345678" / "J-123456789". */
    idNumber: string
    holderName: string
}

export const BANK_ACCOUNT_TYPES = ['CORRIENTE', 'AHORRO'] as const
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number]

export interface TransferContent {
    enabled: boolean
    bankCode: string
    bankName: string
    /** 20 digits. */
    accountNumber: string
    accountType: BankAccountType
    idNumber: string
    holderName: string
}

export interface ZelleContent {
    enabled: boolean
    email: string
    holderName: string
}

export interface BinanceContent {
    enabled: boolean
    /** Binance Pay ID. */
    payId: string
    /** Optional. */
    email: string
    /** Optional. */
    holderName: string
}

export interface PaymentContent {
    /** General notes shown with every method (optional). */
    instructions: string
    pagoMovil: PagoMovilContent
    transfer: TransferContent
    zelle: ZelleContent
    binance: BinanceContent
}

export interface SiteContent {
    general: GeneralContent
    home: HomeContent
    about: AboutContent
    contact: ContactContent
    contactPage: ContactPageContent
    shipping: ShippingContent
    payment: PaymentContent
}

/** The payment section's key of each method. */
export const PAYMENT_METHOD_SECTIONS = {
    PAGO_MOVIL: 'pagoMovil',
    TRANSFERENCIA: 'transfer',
    ZELLE: 'zelle',
    BINANCE: 'binance',
} as const satisfies Record<PaymentMethod, keyof Omit<PaymentContent, 'instructions'>>

/** Fields a method needs before checkout can offer it. */
const REQUIRED_PAYMENT_FIELDS: { [M in PaymentMethod]: readonly string[] } = {
    PAGO_MOVIL: ['bankCode', 'bankName', 'phone', 'idNumber', 'holderName'],
    TRANSFERENCIA: ['bankCode', 'bankName', 'accountNumber', 'idNumber', 'holderName'],
    ZELLE: ['email', 'holderName'],
    BINANCE: ['payId'],
}

/** A method is offered when it is enabled and every required detail is filled in. */
export function isMethodConfigured(payment: PaymentContent, method: PaymentMethod): boolean {
    const details = payment[PAYMENT_METHOD_SECTIONS[method]] as unknown as Record<
        string,
        unknown
    > & { enabled: boolean }
    return (
        details.enabled === true &&
        REQUIRED_PAYMENT_FIELDS[method].every((field) => {
            const value = details[field]
            return typeof value === 'string' && value.trim() !== ''
        })
    )
}

/** The methods checkout offers, in display order. */
export function configuredMethods(payment: PaymentContent): PaymentMethod[] {
    return PAYMENT_METHODS.filter((method) => isMethodConfigured(payment, method))
}
