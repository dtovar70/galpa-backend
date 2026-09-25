import type { OrderPayment } from '../entities/order-payment.entity.js'
import type { Order } from '../entities/order.entity.js'

/** The verified payment of the order (the newest one reviewed), or null. */
export function verifiedPayment(payments: readonly OrderPayment[]): OrderPayment | null {
    const verified = payments
        .filter((payment) => payment.status === 'VERIFICADO')
        .sort(
            (a, b) =>
                (b.reviewedAt?.getTime() ?? b.createdAt.getTime()) -
                (a.reviewedAt?.getTime() ?? a.createdAt.getTime()),
        )
    return verified[0] ?? null
}

/** A receipt exists once a payment was verified, unless the order was cancelled. */
export function hasReceipt(
    order: Pick<Order, 'status'>,
    payments: readonly OrderPayment[],
): boolean {
    return order.status !== 'CANCELADO' && verifiedPayment(payments) !== null
}
