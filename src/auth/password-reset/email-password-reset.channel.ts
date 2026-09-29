import { Injectable } from '@nestjs/common'
import { ContentService } from '../../content/content.service.js'
import { renderEmail, type EmailBlock } from '../../mail/email-layout.js'
import { MailService } from '../../mail/mail.service.js'
import type { OutgoingMail } from '../../mail/mail.types.js'
import type { PasswordResetChannel, PasswordResetRecipient } from './password-reset.channel.js'

export const PASSWORD_RESET_CODE_SUBJECT = 'Tu código para restablecer la contraseña'
export const PASSWORD_CHANGED_SUBJECT = 'Tu contraseña se cambió'

/**
 * Password reset codes by email, to the account's own address. It is the fallback after
 * Telegram (see `PASSWORD_RESET_CHANNEL_LIST`), and only reaches anyone when mail really goes
 * out: with MAIL_DRIVER=log it never claims a user (the code would only land in a log).
 */
@Injectable()
export class EmailPasswordResetChannel implements PasswordResetChannel {
    readonly id = 'email' as const

    constructor(
        private readonly mail: MailService,
        private readonly content: ContentService,
    ) {}

    /** The service only asks about active users; they need an address and mail must be on. */
    canReach(user: PasswordResetRecipient): Promise<boolean> {
        return Promise.resolve(this.mail.delivers && user.email.trim() !== '')
    }

    async sendCode(user: PasswordResetRecipient, code: string, ttlMinutes: number) {
        const sent = await this.send(
            user,
            PASSWORD_RESET_CODE_SUBJECT,
            `Tu código es ${code}. Vence en ${ttlMinutes} minutos.`,
            (brand) => [
                { kind: 'heading', text: `Hola, ${user.name}` },
                {
                    kind: 'paragraph',
                    parts: [
                        `Usa este código para restablecer tu contraseña del panel de ${brand}:`,
                    ],
                },
                { kind: 'rows', rows: [{ label: 'Código', value: code, strong: true }] },
                {
                    kind: 'paragraph',
                    parts: [
                        'Vence en ',
                        { bold: `${ttlMinutes} minutos` },
                        '. No lo compartas con nadie.',
                    ],
                },
                {
                    kind: 'note',
                    parts: [
                        'Si no fuiste tú, ignora este correo y avísale a un administrador. Tu contraseña no cambia mientras nadie use el código.',
                    ],
                },
            ],
        )
        return sent ? 1 : 0
    }

    async sendPasswordChanged(user: PasswordResetRecipient): Promise<void> {
        await this.send(
            user,
            PASSWORD_CHANGED_SUBJECT,
            'La contraseña de tu cuenta se acaba de cambiar.',
            (brand) => [
                { kind: 'heading', text: `Hola, ${user.name}` },
                {
                    kind: 'paragraph',
                    parts: [
                        `La contraseña de tu cuenta del panel de ${brand} se acaba de cambiar. Ya puedes iniciar sesión con la nueva.`,
                    ],
                },
                {
                    kind: 'note',
                    parts: ['Si no fuiste tú, contacta a un administrador de inmediato.'],
                },
            ],
        )
    }

    private async send(
        user: PasswordResetRecipient,
        subject: string,
        preheader: string,
        blocks: (brand: string) => EmailBlock[],
    ): Promise<boolean> {
        const { general, contact } = await this.content.getAll()
        const rendered = renderEmail({
            brandName: general.brandName,
            contact,
            preheader,
            blocks: blocks(general.brandName),
        })
        const message: OutgoingMail = { to: user.email, subject, ...rendered }
        return this.mail.send(message, `password reset for user ${user.id}`)
    }
}
