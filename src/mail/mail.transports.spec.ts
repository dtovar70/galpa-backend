import type { ConfigService } from '@nestjs/config'
import type { Env } from '../config/env.schema.js'
import {
    createMailTransport,
    LogMailTransport,
    maskEmail,
    redactEmails,
    RESEND_API_URL,
    ResendMailTransport,
    SmtpMailTransport,
} from './mail.transports.js'

const MESSAGE = {
    to: 'ana@example.com',
    subject: 'Recibimos tu pedido MR-000001',
    html: '<p>Hola</p>',
    text: 'Hola',
}

function config(values: Partial<Env>): ConfigService<Env, true> {
    return { get: (key: keyof Env) => values[key] } as unknown as ConfigService<Env, true>
}

describe('mail transports', () => {
    it('masks and redacts addresses for the logs', () => {
        expect(maskEmail('ana.maria@example.com')).toBe('an***@example.com')
        expect(maskEmail('a@example.com')).toBe('a***@example.com')
        expect(maskEmail('nope')).toBe('***')
        expect(redactEmails('550 <ana@example.com>: Recipient rejected')).toBe(
            '550 <[email]>: Recipient rejected',
        )
    })

    it('posts to Resend with the key, the sender and the reply-to', async () => {
        const fetchFn = vi.fn().mockResolvedValue(new Response('{"id":"1"}', { status: 200 }))
        const transport = new ResendMailTransport(
            're_secret',
            { from: 'Tienda <pedidos@example.com>', replyTo: 'hola@example.com' },
            fetchFn as unknown as typeof fetch,
        )
        await transport.send(MESSAGE)
        expect(fetchFn).toHaveBeenCalledTimes(1)
        const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit]
        expect(url).toBe(RESEND_API_URL)
        expect(init.method).toBe('POST')
        expect(init.headers).toMatchObject({ Authorization: 'Bearer re_secret' })
        expect(JSON.parse(init.body as string)).toEqual({
            from: 'Tienda <pedidos@example.com>',
            to: ['ana@example.com'],
            subject: MESSAGE.subject,
            html: MESSAGE.html,
            text: MESSAGE.text,
            reply_to: 'hola@example.com',
        })
    })

    it('throws when Resend refuses the message', async () => {
        const fetchFn = vi
            .fn()
            .mockResolvedValue(new Response('{"message":"Invalid `from`"}', { status: 422 }))
        const transport = new ResendMailTransport(
            're_secret',
            { from: 'pedidos@example.com', replyTo: undefined },
            fetchFn as unknown as typeof fetch,
        )
        await expect(transport.send(MESSAGE)).rejects.toThrow(/Resend answered 422/)
        const body = JSON.parse((fetchFn.mock.calls[0] as [string, RequestInit])[1].body as string)
        expect(body).not.toHaveProperty('reply_to')
    })

    it('picks the transport from MAIL_DRIVER, and always log under NODE_ENV=test', () => {
        const smtp = {
            MAIL_DRIVER: 'smtp',
            MAIL_FROM: 'pedidos@example.com',
            SMTP_HOST: 'localhost',
            SMTP_PORT: 1025,
        } as const
        expect(createMailTransport(config({ NODE_ENV: 'development', ...smtp }))).toBeInstanceOf(
            SmtpMailTransport,
        )
        expect(createMailTransport(config({ NODE_ENV: 'test', ...smtp }))).toBeInstanceOf(
            LogMailTransport,
        )
        const resend = createMailTransport(
            config({
                NODE_ENV: 'production',
                MAIL_DRIVER: 'resend',
                MAIL_FROM: 'pedidos@example.com',
                RESEND_API_KEY: 're_1',
            }),
        )
        expect(resend).toBeInstanceOf(ResendMailTransport)
        expect(resend.delivers).toBe(true)
        const log = createMailTransport(config({ NODE_ENV: 'production', MAIL_DRIVER: 'log' }))
        expect(log.delivers).toBe(false)
    })
})
