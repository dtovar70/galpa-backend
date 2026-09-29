import type { MailDriver } from '../config/env.schema.js'

/** One email, ready to go: an HTML body and its plain-text alternative. */
export interface OutgoingMail {
    to: string
    subject: string
    html: string
    text: string
}

/** What a transport needs besides the message (from MAIL_FROM / MAIL_REPLY_TO). */
export interface MailEnvelope {
    from: string
    replyTo: string | undefined
}

/** Where emails actually go (MAIL_DRIVER). Tests replace it through `MAIL_TRANSPORT`. */
export interface MailTransport {
    readonly driver: MailDriver
    /**
     * Whether a message reaches a real inbox. False for `log`: callers that would do extra work
     * only for the email (issuing an order link, choosing email for a reset code) skip it then.
     */
    readonly delivers: boolean
    /** Throws when the provider refuses or cannot be reached; `MailService` catches it. */
    send(message: OutgoingMail): Promise<void>
}

export const MAIL_TRANSPORT = Symbol('MAIL_TRANSPORT')
