/**
 * Colors an order status badge may take: the semantic variants of the storefront's `Badge`
 * component (frontend-galpa/src/components/ui/Badge.tsx). Enforced by a CHECK on
 * `order_statuses.tone`.
 */
export const BADGE_TONES = [
    'brand',
    'warning',
    'info',
    'danger',
    'outline',
    'solid',
    'neutral',
] as const

export type BadgeTone = (typeof BADGE_TONES)[number]
