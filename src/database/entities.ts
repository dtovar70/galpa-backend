import { User } from '../auth/entities/user.entity.js'
import { Category } from '../categories/entities/category.entity.js'
import { SiteContentEntry } from '../content/entities/site-content.entity.js'
import { ProductImage } from '../products/entities/product-image.entity.js'
import { ProductVariant } from '../products/entities/product-variant.entity.js'
import { Product } from '../products/entities/product.entity.js'

/** Every entity, shared by the Nest app and the CLI DataSource. */
export const ENTITIES = [User, Category, Product, ProductVariant, ProductImage, SiteContentEntry]
