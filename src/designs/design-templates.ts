import type { Category } from '../categories/entities/category.entity.js'

/**
 * "Diseña con tu imagen": the categories with a generated illustration template, and the
 * physical size of their print area. Keyed by category slug. A category is designable when it
 * has one of these or template photos uploaded by the admin ("Plantilla para diseñar", see
 * `resolveDesignTemplate`); otherwise its products do not offer the editor (and the API refuses
 * their designs).
 *
 * Mirror of frontend-cups/src/constants/design.constant.ts (the editor draws the same areas).
 */
export interface DesignTemplate {
    /** Printable width and height in centimeters. */
    widthCm: number
    heightCm: number
}

export const DESIGN_TEMPLATES: Readonly<Record<string, DesignTemplate>> = {
    /** Sublimation wrap of an 11 oz mug. */
    mugs: { widthCm: 20, heightCm: 8.5 },
    /** Front print of a t-shirt. */
    tees: { widthCm: 25, heightCm: 30 },
}

/**
 * Categories that never offer the editor, even with template photos. Keychains come in many
 * shapes (round, heart…) and the print area is still a rectangle, so a design could fall off
 * the product; their customers personalize with the text field or send the photo instead.
 */
export const DESIGN_DISABLED_CATEGORIES: ReadonlySet<string> = new Set(['keychains'])

export function isDesignDisabled(categorySlug: string): boolean {
    return DESIGN_DISABLED_CATEGORIES.has(categorySlug)
}

/** The category columns that decide its design template. */
export type CategoryDesignFields = Pick<
    Category,
    'slug' | 'designPrintWidthCm' | 'designPrintHeightCm'
>

/**
 * The effective print size of a category: its own (admin-set) size in cm, else the hardcoded
 * illustration template's. Null when the category is not designable: it needs template photos
 * (`hasPhotos`: at least one garment color, each always with its print area) and a size, or a
 * hardcoded illustration template.
 */
export function resolveDesignTemplate(
    category: CategoryDesignFields,
    hasPhotos: boolean,
): DesignTemplate | null {
    if (isDesignDisabled(category.slug)) return null
    const fallback = designTemplateFor(category.slug)
    const own =
        category.designPrintWidthCm && category.designPrintHeightCm
            ? { widthCm: category.designPrintWidthCm, heightCm: category.designPrintHeightCm }
            : null
    if (hasPhotos && own) return own
    return fallback ? (own ?? fallback) : null
}

/** Below this the print may look blurry: shown as a warning. */
export const LOW_DPI = 150
/** Below this the print will look blurry: shown as a strong warning (never blocking). */
export const MIN_DPI = 72

const CM_PER_INCH = 2.54

export function designTemplateFor(categorySlug: string): DesignTemplate | null {
    return Object.hasOwn(DESIGN_TEMPLATES, categorySlug) ? DESIGN_TEMPLATES[categorySlug]! : null
}

/**
 * Effective resolution of the print: the image's pixels spread over the width they cover on the
 * product. `scale` is the image width relative to the print area width (see DesignPlacement), so
 * the image covers `scale × widthCm`.
 */
export function estimateDpi(pixelWidth: number, scale: number, template: DesignTemplate): number {
    const inches = (scale * template.widthCm) / CM_PER_INCH
    return inches > 0 ? Math.round(pixelWidth / inches) : 0
}

/** The "arte final" is rendered at this resolution of the physical print size… */
export const ARTWORK_DPI = 200
/** …capped to this many pixels on its long side… */
export const ARTWORK_MAX_SIDE = 4000
/** …and, to fit the storage's file limit, possibly lower, but never below this. */
export const ARTWORK_MIN_DPI = 100

/**
 * Pixel size of the "arte final" of a print area at `dpi` (200 by default), scaled down to
 * `maxSide` px on the long side (never below 100 DPI). Mirror of the editor's `artworkSize`.
 */
export function artworkSize(
    template: DesignTemplate,
    dpi = ARTWORK_DPI,
    maxSide = ARTWORK_MAX_SIDE,
): { width: number; height: number } {
    const inches = (cm: number) => cm / CM_PER_INCH
    const longest = Math.max(inches(template.widthCm), inches(template.heightCm))
    const effective = Math.max(Math.min(dpi, maxSide / longest), ARTWORK_MIN_DPI)
    return {
        width: Math.max(1, Math.round(inches(template.widthCm) * effective)),
        height: Math.max(1, Math.round(inches(template.heightCm) * effective)),
    }
}

/**
 * The resolution of an uploaded arte final on this print area, or null when it is not one: its
 * shape must match the area's within 2 %, and its DPI be 100–200 (2 % tolerance).
 */
export function artworkDpi(
    size: { width: number; height: number },
    template: DesignTemplate,
): number | null {
    const tolerance = 0.02
    const aspect = size.width / size.height
    const expected = template.widthCm / template.heightCm
    if (Math.abs(aspect - expected) / expected > tolerance) return null
    const dpi = size.width / (template.widthCm / CM_PER_INCH)
    if (dpi < ARTWORK_MIN_DPI * (1 - tolerance) || dpi > ARTWORK_DPI * (1 + tolerance)) return null
    return Math.round(dpi)
}

export type DpiLevel = 'ok' | 'low' | 'veryLow'

export function dpiLevel(dpi: number): DpiLevel {
    if (dpi < MIN_DPI) return 'veryLow'
    if (dpi < LOW_DPI) return 'low'
    return 'ok'
}
