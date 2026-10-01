import { Logger } from '@nestjs/common'
import type { OrderStatusChangedEvent } from '../orders.events.js'
import { OrderEmailsListener } from './order-emails.listener.js'
import type { OrderEmailsService } from './order-emails.service.js'

function setup(options: { enabled?: boolean; fails?: boolean } = {}) {
    const emails = {
        enabled: options.enabled ?? true,
        sendOrderReceived: vi.fn().mockResolvedValue(true),
        sendStatusChanged: options.fails
            ? vi.fn().mockRejectedValue(new Error('SMTP down'))
            : vi.fn().mockResolvedValue(true),
    }
    const listener = new OrderEmailsListener(emails as unknown as OrderEmailsService)
    return { listener, emails }
}

function changed(to: OrderStatusChangedEvent['to'], note: string | null = null) {
    return {
        orderId: 'o1',
        code: 'GP-000001',
        from: 'EN_PREPARACION',
        to,
        actor: 'admin',
        actorUserId: 'u1',
        note,
        changedAt: new Date().toISOString(),
    } satisfies OrderStatusChangedEvent
}

describe('OrderEmailsListener status changes', () => {
    beforeEach(() => {
        vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    })
    afterEach(() => vi.restoreAllMocks())

    it('emails the customer for the statuses that matter, with the note', async () => {
        const { listener, emails } = setup()
        await listener.onStatusChanged(changed('DESPACHADO', 'MRW guía 123'))
        expect(emails.sendStatusChanged).toHaveBeenCalledWith('o1', 'DESPACHADO', 'MRW guía 123')
    })

    it('stays quiet for internal steps and when mail is off', async () => {
        const quiet = setup()
        await quiet.listener.onStatusChanged(changed('EN_PREPARACION'))
        await quiet.listener.onStatusChanged(changed('PENDIENTE_VERIFICACION'))
        expect(quiet.emails.sendStatusChanged).not.toHaveBeenCalled()

        const off = setup({ enabled: false })
        await off.listener.onStatusChanged(changed('ENTREGADO'))
        expect(off.emails.sendStatusChanged).not.toHaveBeenCalled()
    })

    it('logs a failure instead of throwing', async () => {
        const { listener } = setup({ fails: true })
        await expect(listener.onStatusChanged(changed('CANCELADO', 'Sin stock'))).resolves.toBe(
            undefined,
        )
        expect(Logger.prototype.error).toHaveBeenCalledWith(
            'Status email (CANCELADO) of GP-000001 failed: SMTP down',
        )
    })
})
