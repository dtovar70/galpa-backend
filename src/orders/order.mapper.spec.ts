import type { Order } from './entities/order.entity.js'
import { canSubmitPayment, isLatePayment } from './order.mapper.js'
import type { OrderStatus } from './order-status.js'

const NOW = new Date('2026-09-24T12:00:00Z')

function order(status: OrderStatus, dueInMs: number): Pick<Order, 'status' | 'paymentDueAt'> {
    return { status, paymentDueAt: new Date(NOW.getTime() + dueInMs) }
}

describe('payment acceptance', () => {
    it('accepts a proof while due, after a rejection, after the deadline and once expired', () => {
        for (const status of ['PENDIENTE_PAGO', 'PAGO_RECHAZADO', 'EXPIRADO'] as const) {
            expect(canSubmitPayment(order(status, -60_000))).toBe(true)
        }
        for (const status of ['PENDIENTE_VERIFICACION', 'CANCELADO', 'ENTREGADO'] as const) {
            expect(canSubmitPayment(order(status, 60_000))).toBe(false)
        }
    })

    it('flags a payment as late by the date it was paid, not by when it was uploaded', () => {
        // Deadline 2026-09-24T12:00Z is 08:00 on 2026-09-24 in Caracas.
        const due = order('PENDIENTE_PAGO', 0)
        expect(isLatePayment(due, '2026-09-23')).toBe(false)
        expect(isLatePayment(due, '2026-09-24')).toBe(false)
        expect(isLatePayment(due, '2026-09-25')).toBe(true)
        // An expired order paid on time (proof uploaded late) is not late.
        expect(isLatePayment(order('EXPIRADO', -86_400_000), '2026-09-23')).toBe(false)
    })
})
