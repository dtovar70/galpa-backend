import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '../config/env.schema.js'
import { MailService } from './mail.service.js'
import { createMailTransport } from './mail.transports.js'
import { MAIL_TRANSPORT } from './mail.types.js'

/** Outgoing email (MAIL_DRIVER: log, smtp or resend). Templates live with their features. */
@Module({
    providers: [
        {
            provide: MAIL_TRANSPORT,
            inject: [ConfigService],
            useFactory: (config: ConfigService<Env, true>) => createMailTransport(config),
        },
        MailService,
    ],
    exports: [MailService],
})
export class MailModule {}
