import type { MailDriver } from '../config/env.schema.js'

/** A file sent with an email (e.g. a quote PDF). */
export interface MailAttachment {
    filename: string
    content: Buffer
    contentType: string
}

/** One email, ready to go: an HTML body, its plain-text alternative and optional files. */
export interface OutgoingMail {
    to: string
    subject: string
    html: string
    text: string
    /** Overrides MAIL_REPLY_TO (e.g. the customer who wrote the contact form). */
    replyTo?: string
    attachments?: MailAttachment[]
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
