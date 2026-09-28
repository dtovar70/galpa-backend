/**
 * Inline-button payloads. Telegram caps `callback_data` at 64 bytes, so each one is a short
 * action prefix plus the payment id (a 36-character UUID): at most 41 bytes. Anything that does
 * not parse exactly is ignored.
 */
export type CallbackAction =
    /** ✅ Pago recibido. */
    | { type: 'verify'; paymentId: string }
    /** ✅ Confirmar igual (falta stock): verify acknowledging the stock conflict. */
    | { type: 'verifyAck'; paymentId: string }
    /** ❌ Rechazar: asks for the reason. */
    | { type: 'reject'; paymentId: string }
    /** A quick reason (index in REJECT_REASONS). */
    | { type: 'rejectReason'; paymentId: string; reason: number }
    /** "Otro motivo…": asks for a typed reason. */
    | { type: 'rejectOther'; paymentId: string }
    /** Cancels a pending question about the payment. */
    | { type: 'cancel'; paymentId: string }
    /** /salir confirmation. */
    | { type: 'unlink'; confirm: boolean }

/** Quick rejection reasons (the customer reads them on the order page). */
export const REJECT_REASONS = [
    'Monto incompleto',
    'No encontramos el pago',
    'Referencia inválida',
] as const

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const PAYMENT_ACTION = new RegExp(`^(pv|pa|pr|ro|pc):(${UUID})$`)
const REASON_ACTION = new RegExp(`^rq:(\\d):(${UUID})$`)

export function encodeCallback(action: CallbackAction): string {
    switch (action.type) {
        case 'verify':
            return `pv:${action.paymentId}`
        case 'verifyAck':
            return `pa:${action.paymentId}`
        case 'reject':
            return `pr:${action.paymentId}`
        case 'rejectReason':
            return `rq:${action.reason}:${action.paymentId}`
        case 'rejectOther':
            return `ro:${action.paymentId}`
        case 'cancel':
            return `pc:${action.paymentId}`
        case 'unlink':
            return action.confirm ? 'ux:y' : 'ux:n'
    }
}

export function parseCallback(data: string | undefined): CallbackAction | null {
    if (!data || data.length > 64) return null
    if (data === 'ux:y' || data === 'ux:n') return { type: 'unlink', confirm: data === 'ux:y' }
    const reason = REASON_ACTION.exec(data)
    if (reason) {
        const index = Number(reason[1])
        return index < REJECT_REASONS.length
            ? { type: 'rejectReason', reason: index, paymentId: reason[2] as string }
            : null
    }
    const match = PAYMENT_ACTION.exec(data)
    if (!match) return null
    const paymentId = match[2] as string
    switch (match[1]) {
        case 'pv':
            return { type: 'verify', paymentId }
        case 'pa':
            return { type: 'verifyAck', paymentId }
        case 'pr':
            return { type: 'reject', paymentId }
        case 'ro':
            return { type: 'rejectOther', paymentId }
        default:
            return { type: 'cancel', paymentId }
    }
}
