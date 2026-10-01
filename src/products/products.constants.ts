export const PRODUCT_TAGS = ['nuevo', 'bestseller', 'oferta'] as const
export type ProductTag = (typeof PRODUCT_TAGS)[number]

/** `STOCK`: sold from counted units. `ON_ORDER`: "bajo pedido", no stock limit. */
export const STOCK_MODES = ['STOCK', 'ON_ORDER'] as const
export type StockMode = (typeof STOCK_MODES)[number]

/** Computed from the stock mode and the stock (see `productAvailability`). */
export const AVAILABILITIES = ['IN_STOCK', 'ON_ORDER', 'OUT_OF_STOCK'] as const
export type Availability = (typeof AVAILABILITIES)[number]
/** What `?availability=` may filter by. */
export const AVAILABILITY_FILTERS = ['IN_STOCK', 'ON_ORDER'] as const
export type AvailabilityFilter = (typeof AVAILABILITY_FILTERS)[number]

export const SORT_OPTIONS = ['relevance', 'price-asc', 'price-desc', 'newest'] as const
export type SortOption = (typeof SORT_OPTIONS)[number]

export const DEFAULT_PAGE_SIZE = 12
export const MAX_PAGE_SIZE = 48
/** The admin products list pages by 10 like every other admin list; the store grid keeps 12. */
export const ADMIN_DEFAULT_PAGE_SIZE = 10
/** Default and maximum `limit` for the featured and related endpoints. */
export const FEATURED_LIMIT = 8
export const MAX_FEATURED_LIMIT = 24
export const RELATED_LIMIT = 4
export const MAX_RELATED_LIMIT = 12

/** Multi-line description (a textarea); enforced by the DTO and a CHECK on the column. */
export const PRODUCT_DESCRIPTION_MAX_LENGTH = 4000
/** "Detalles destacados": at most this many, each a single-line text. */
export const PRODUCT_MAX_HIGHLIGHTS = 6
/** "Ficha técnica": at most this many label/value rows (also a CHECK on the column). */
export const PRODUCT_MAX_SPECS = 30
export const PRODUCT_SPEC_LABEL_MAX_LENGTH = 60
export const PRODUCT_SPEC_VALUE_MAX_LENGTH = 120
/** Largest BTU capacity accepted (commercial units stay far below it). */
export const MAX_BTU = 1_000_000
export const MAX_LEAD_TIME_DAYS = 365

export const MAX_IMAGES_PER_UPLOAD = 8
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

/** `POST /products/availability`: cart lines per request (the checkout allows 50 lines). */
export const AVAILABILITY_MAX_ITEMS = 50
/** Longest product or variant id accepted there (the same limit as the order lines). */
export const AVAILABILITY_ID_MAX_LENGTH = 80

export const PRODUCT_NOT_FOUND = 'No encontramos el producto solicitado.'
