import { User } from '../auth/entities/user.entity.js'
import { Bank } from '../catalogs/entities/bank.entity.js'
import { OrderStatusDefinition } from '../catalogs/entities/order-status-definition.entity.js'
import { OrderStatusGroup } from '../catalogs/entities/order-status-group.entity.js'
import { Category } from '../categories/entities/category.entity.js'
import { SiteContentEntry } from '../content/entities/site-content.entity.js'
import { ExchangeRate } from '../exchange-rate/entities/exchange-rate.entity.js'
import { OrderAccessLink } from '../orders/entities/order-access-link.entity.js'
import { OrderItem } from '../orders/entities/order-item.entity.js'
import { OrderNote } from '../orders/entities/order-note.entity.js'
import { OrderPayment } from '../orders/entities/order-payment.entity.js'
import { OrderStatusHistory } from '../orders/entities/order-status-history.entity.js'
import { Order } from '../orders/entities/order.entity.js'
import { ProductImage } from '../products/entities/product-image.entity.js'
import { ProductVariant } from '../products/entities/product-variant.entity.js'
import { Product } from '../products/entities/product.entity.js'

/** Every entity, shared by the Nest app and the CLI DataSource. */
export const ENTITIES = [
    User,
    Category,
    Product,
    ProductVariant,
    ProductImage,
    SiteContentEntry,
    ExchangeRate,
    Order,
    OrderItem,
    OrderPayment,
    OrderStatusHistory,
    OrderNote,
    OrderAccessLink,
    OrderStatusGroup,
    OrderStatusDefinition,
    Bank,
]
