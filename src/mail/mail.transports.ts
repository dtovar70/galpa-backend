import { Logger } from '@nestjs/common'
import type { ConfigService } from '@nestjs/config'
import nodemailer, { type Transporter } from 'nodemailer'
import type { Env } from '../config/env.schema.js'
import type { MailEnvelope, MailTransport, OutgoingMail } from './mail.types.js'

export const RESEND_API_URL = 'https://api.resend.com/emails'
/** Neither SMTP nor Resend may hold a caller (or the shutdown) for long. */
const MAIL_TIMEOUT_MS = 15_000

/** "ana.maria@example.com" -> "an***@example.com" (logs never keep a full address). */
export function maskEmail(email: string): string {
    const at = email.lastIndexOf('@')
    if (at < 1) return '***'
    return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`
}

/** Removes email addresses from a provider's error text before it is logged. */
export function redactEmails(text: string): string {
    return text.replace(/[^\s<>"'(),;:]+@[^\s<>"'(),;:]+/g, '[email]')
}

/** MAIL_DRIVER=log: nothing leaves the server; the masked recipient and subject are logged. */
export class LogMailTransport implements MailTransport {
    readonly driver = 'log' as const
    readonly delivers = false
    private readonly logger = new Logger('Mail')

    send(message: OutgoingMail): Promise<void> {
        const files = message.attachments?.length
            ? ` with ${message.attachments.length} attachment(s)`
            : ''
        this.logger.log(
            `[MAIL_DRIVER=log] Not sent: "${message.subject}" to ${maskEmail(message.to)}${files}`,
        )
        return Promise.resolve()
    }
}

/** MAIL_DRIVER=smtp (Mailpit in development, or any SMTP server). */
export class SmtpMailTransport implements MailTransport {
    readonly driver = 'smtp' as const
    readonly delivers = true
    private readonly transporter: Transporter

    constructor(
        options: { host: string; port: number; user?: string; pass?: string },
        private readonly envelope: MailEnvelope,
    ) {
        this.transporter = nodemailer.createTransport({
            host: options.host,
            port: options.port,
            // 465 is implicit TLS; other ports upgrade with STARTTLS when the server offers it.
            secure: options.port === 465,
            auth: options.user ? { user: options.user, pass: options.pass } : undefined,
            connectionTimeout: MAIL_TIMEOUT_MS,
            greetingTimeout: MAIL_TIMEOUT_MS,
            socketTimeout: MAIL_TIMEOUT_MS,
        })
    }

    async send(message: OutgoingMail): Promise<void> {
        await this.transporter.sendMail({
            from: this.envelope.from,
            replyTo: message.replyTo ?? this.envelope.replyTo,
            to: message.to,
            subject: message.subject,
            html: message.html,
            text: message.text,
            attachments: message.attachments?.map((file) => ({
                filename: file.filename,
                content: file.content,
                contentType: file.contentType,
            })),
        })
    }
}

/** MAIL_DRIVER=resend: Resend's HTTP API with the global fetch (no SDK). */
export class ResendMailTransport implements MailTransport {
    readonly driver = 'resend' as const
    readonly delivers = true

    constructor(
        private readonly apiKey: string,
        private readonly envelope: MailEnvelope,
        private readonly fetchFn: typeof fetch = fetch,
    ) {}

    async send(message: OutgoingMail): Promise<void> {
        const response = await this.fetchFn(RESEND_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: this.envelope.from,
                to: [message.to],
                subject: message.subject,
                html: message.html,
                text: message.text,
                ...((message.replyTo ?? this.envelope.replyTo)
                    ? { reply_to: message.replyTo ?? this.envelope.replyTo }
                    : {}),
                ...(message.attachments?.length
                    ? {
                          attachments: message.attachments.map((file) => ({
                              filename: file.filename,
                              content: file.content.toString('base64'),
                              content_type: file.contentType,
                          })),
                      }
                    : {}),
            }),
            signal: AbortSignal.timeout(MAIL_TIMEOUT_MS),
        })
        if (!response.ok) {
            const detail = (await response.text().catch(() => '')).slice(0, 300)
            throw new Error(`Resend answered ${response.status}${detail ? `: ${detail}` : ''}`)
        }
    }
}

/**
 * The transport for MAIL_DRIVER. NODE_ENV=test always gets `log`, so the test suites never
 * reach an SMTP server or Resend even with a developer's `.env` (tests that need to see the
 * emails override `MAIL_TRANSPORT`).
 */
export function createMailTransport(config: ConfigService<Env, true>): MailTransport {
    const driver = config.get('MAIL_DRIVER', { infer: true })
    if (driver === 'log' || config.get('NODE_ENV', { infer: true }) === 'test') {
        return new LogMailTransport()
    }
    // The env schema guarantees these for smtp/resend.
    const envelope: MailEnvelope = {
        from: config.get('MAIL_FROM', { infer: true }) as string,
        replyTo: config.get('MAIL_REPLY_TO', { infer: true }),
    }
    if (driver === 'smtp') {
        return new SmtpMailTransport(
            {
                host: config.get('SMTP_HOST', { infer: true }) as string,
                port: config.get('SMTP_PORT', { infer: true }) as number,
                user: config.get('SMTP_USER', { infer: true }),
                pass: config.get('SMTP_PASS', { infer: true }),
            },
            envelope,
        )
    }
    return new ResendMailTransport(
        config.get('RESEND_API_KEY', { infer: true }) as string,
        envelope,
    )
}
