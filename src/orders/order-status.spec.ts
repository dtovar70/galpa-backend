import { Role } from '../auth/role.enum.js'
import {
    allowedTransitions,
    checkTransition,
    invalidTransitionMessage,
    ORDER_STATUSES,
    ORDER_TRANSITIONS,
    type OrderActor,
} from './order-status.js'

const ADMIN: OrderActor = { kind: 'admin', userId: 'u1', role: Role.ADMIN }
const EDITOR: OrderActor = { kind: 'admin', userId: 'u2', role: Role.EDITOR }
const CUSTOMER: OrderActor = { kind: 'customer' }
const SYSTEM: OrderActor = { kind: 'system' }
const TELEGRAM: OrderActor = { kind: 'telegram' }

describe('order transition map', () => {
    it('lets a payment be recorded while due, after a rejection or once expired', () => {
        for (const from of ['PENDIENTE_PAGO', 'PAGO_RECHAZADO', 'EXPIRADO'] as const) {
            for (const actor of [CUSTOMER, ADMIN, EDITOR]) {
                const check = checkTransition(from, 'PENDIENTE_VERIFICACION', actor)
                expect(check.ok && check.rule.requiresPayment).toBe(true)
            }
            expect(checkTransition(from, 'PENDIENTE_VERIFICACION', TELEGRAM).ok).toBe(false)
        }
        expect(checkTransition('PAGO_VERIFICADO', 'PENDIENTE_VERIFICACION', CUSTOMER)).toEqual({
            ok: false,
            reason: 'invalid',
        })
    })

    it('takes the stock back when a late payment arrives on an expired order', () => {
        const late = checkTransition('EXPIRADO', 'PENDIENTE_VERIFICACION', CUSTOMER)
        expect(late.ok && late.rule.reservesStock && !late.rule.reactivates).toBe(true)
        const onTime = checkTransition('PENDIENTE_PAGO', 'PENDIENTE_VERIFICACION', CUSTOMER)
        expect(onTime.ok && onTime.rule.reservesStock).toBeFalsy()
    })

    it('keeps a cancelled order closed to customer payments', () => {
        expect(checkTransition('CANCELADO', 'PENDIENTE_VERIFICACION', CUSTOMER)).toEqual({
            ok: false,
            reason: 'invalid',
        })
        expect(checkTransition('CANCELADO', 'PENDIENTE_VERIFICACION', ADMIN).ok).toBe(false)
    })

    it('reactivates an expired order (staff only); a cancelled one stays closed', () => {
        for (const actor of [ADMIN, EDITOR]) {
            const expired = checkTransition('EXPIRADO', 'PENDIENTE_PAGO', actor)
            expect(expired.ok && expired.rule.reactivates && expired.rule.reservesStock).toBe(true)
        }
        expect(checkTransition('EXPIRADO', 'PENDIENTE_PAGO', CUSTOMER).ok).toBe(false)
        expect(checkTransition('EXPIRADO', 'PENDIENTE_PAGO', TELEGRAM).ok).toBe(false)
        expect(checkTransition('CANCELADO', 'PENDIENTE_PAGO', ADMIN)).toEqual({
            ok: false,
            reason: 'invalid',
        })
    })

    it('lets staff (admin or the Telegram bot) verify or reject a payment', () => {
        for (const actor of [ADMIN, EDITOR, TELEGRAM]) {
            expect(checkTransition('PENDIENTE_VERIFICACION', 'PAGO_VERIFICADO', actor).ok).toBe(
                true,
            )
            const reject = checkTransition('PENDIENTE_VERIFICACION', 'PAGO_RECHAZADO', actor)
            expect(reject.ok && reject.rule.requiresReason).toBe(true)
        }
        expect(checkTransition('PENDIENTE_VERIFICACION', 'PAGO_VERIFICADO', CUSTOMER).ok).toBe(
            false,
        )
    })

    it('follows the fulfilment steps: delivery, pickup and goods ordered from the supplier', () => {
        const paths = [
            ['PAGO_VERIFICADO', 'EN_PREPARACION', 'DESPACHADO', 'ENTREGADO'],
            ['PAGO_VERIFICADO', 'EN_PREPARACION', 'LISTO_PARA_RETIRO', 'ENTREGADO'],
            ['PAGO_VERIFICADO', 'ESPERANDO_MERCANCIA', 'EN_PREPARACION'],
        ] as const
        for (const path of paths) {
            for (let index = 0; index < path.length - 1; index += 1) {
                expect(checkTransition(path[index]!, path[index + 1]!, EDITOR).ok).toBe(true)
                expect(checkTransition(path[index]!, path[index + 1]!, TELEGRAM).ok).toBe(true)
            }
        }
        expect(checkTransition('PAGO_VERIFICADO', 'DESPACHADO', ADMIN)).toEqual({
            ok: false,
            reason: 'invalid',
        })
        expect(checkTransition('ESPERANDO_MERCANCIA', 'DESPACHADO', ADMIN).ok).toBe(false)
    })

    it('reserves cancelling for ADMIN, with a reason, until the order leaves the store', () => {
        for (const from of ['PAGO_VERIFICADO', 'ESPERANDO_MERCANCIA', 'EN_PREPARACION'] as const) {
            const cancel = checkTransition(from, 'CANCELADO', ADMIN)
            expect(cancel.ok && cancel.rule.requiresReason && cancel.rule.restoresStock).toBe(true)
            expect(checkTransition(from, 'CANCELADO', EDITOR)).toEqual({
                ok: false,
                reason: 'forbidden',
            })
        }
        for (const from of [
            'PENDIENTE_VERIFICACION',
            'DESPACHADO',
            'LISTO_PARA_RETIRO',
            'ENTREGADO',
        ] as const) {
            expect(checkTransition(from, 'CANCELADO', ADMIN).ok).toBe(false)
        }
    })

    it('only lets the scheduler expire unpaid orders, restoring their stock', () => {
        const expire = checkTransition('PENDIENTE_PAGO', 'EXPIRADO', SYSTEM)
        expect(expire.ok && expire.rule.restoresStock).toBe(true)
        expect(checkTransition('PENDIENTE_PAGO', 'EXPIRADO', ADMIN).ok).toBe(false)
        expect(checkTransition('PENDIENTE_VERIFICACION', 'EXPIRADO', SYSTEM).ok).toBe(false)
    })

    it('has terminal statuses, reopens an expired one only by reactivation, only known targets', () => {
        expect(ORDER_TRANSITIONS.ENTREGADO).toEqual([])
        expect(ORDER_TRANSITIONS.CANCELADO).toEqual([])
        expect(ORDER_TRANSITIONS.EXPIRADO.map((rule) => rule.to)).toEqual([
            'PENDIENTE_VERIFICACION',
            'PENDIENTE_PAGO',
        ])
        for (const rules of Object.values(ORDER_TRANSITIONS)) {
            for (const rule of rules) expect(ORDER_STATUSES).toContain(rule.to)
        }
    })

    it('lists the actions an EDITOR sees (no cancel, manual payment where one is due)', () => {
        expect(allowedTransitions('PENDIENTE_PAGO', EDITOR).map((rule) => rule.to)).toEqual([
            'PENDIENTE_VERIFICACION',
        ])
        expect(allowedTransitions('EXPIRADO', EDITOR).map((rule) => rule.to)).toEqual([
            'PENDIENTE_VERIFICACION',
            'PENDIENTE_PAGO',
        ])
        expect(allowedTransitions('CANCELADO', EDITOR)).toEqual([])
        expect(allowedTransitions('PENDIENTE_VERIFICACION', EDITOR).map((rule) => rule.to)).toEqual(
            ['PAGO_VERIFICADO', 'PAGO_RECHAZADO'],
        )
        expect(allowedTransitions('PAGO_VERIFICADO', EDITOR).map((rule) => rule.to)).toEqual([
            'ESPERANDO_MERCANCIA',
            'EN_PREPARACION',
        ])
        expect(allowedTransitions('PAGO_VERIFICADO', ADMIN).map((rule) => rule.to)).toEqual([
            'ESPERANDO_MERCANCIA',
            'EN_PREPARACION',
            'CANCELADO',
        ])
    })

    it('explains an invalid move in Spanish', () => {
        const labels: Partial<Record<string, string>> = {
            ENTREGADO: 'Entregado',
            EN_PREPARACION: 'Preparando despacho',
        }
        expect(
            invalidTransitionMessage('ENTREGADO', 'EN_PREPARACION', (code) => labels[code] ?? code),
        ).toBe('No se puede pasar un pedido de «Entregado» a «Preparando despacho».')
    })
})
