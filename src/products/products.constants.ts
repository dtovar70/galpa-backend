export const PRODUCT_TAGS = ['nuevo', 'bestseller', 'oferta', 'personalizable'] as const
export type ProductTag = (typeof PRODUCT_TAGS)[number]

export const SORT_OPTIONS = ['relevance', 'price-asc', 'price-desc', 'newest', 'rating'] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

export const DEFAULT_PAGE_SIZE = 12
export const MAX_PAGE_SIZE = 48
/** Default and maximum `limit` for the featured and related endpoints. */
export const FEATURED_LIMIT = 8
export const MAX_FEATURED_LIMIT = 24
export const RELATED_LIMIT = 4
export const MAX_RELATED_LIMIT = 12

/** Multi-line description (a textarea); enforced by the DTO and a CHECK on the column. */
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 4000
/** "Detalles destacados": at most this many, each a single-line text. */
export const PRODUCT_MAX_HIGHLIGHTS = 6

export const MAX_IMAGES_PER_UPLOAD = 8
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

export const PRODUCT_NOT_FOUND = 'No encontramos el producto solicitado.'
