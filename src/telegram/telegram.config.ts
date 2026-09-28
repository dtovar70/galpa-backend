import type { ConfigService } from '@nestjs/config'
import type { Env } from '../config/env.schema.js'

export type TelegramMode = 'polling' | 'webhook'

/** Path of the webhook under the `/api` prefix. */
export const TELEGRAM_WEBHOOK_PATH = 'telegram/webhook'

export type TelegramSettings =
    | {
          enabled: true
          token: string
          mode: TelegramMode
          webhookSecret: string | null
          /** Full public URL Telegram calls in webhook mode. */
          webhookUrl: string
          apiRoot: string | undefined
      }
    | {
          enabled: false
          mode: TelegramMode
          /** Why the bot is off (English, for the log). */
          reason: string
          /** The same, in Spanish, for the admin page. */
          message: string
      }

/**
 * Reads the TELEGRAM_* variables. The bot is on when a token exists, unless TELEGRAM_ENABLED is
 * false or NODE_ENV is test (then only an explicit TELEGRAM_ENABLED=true turns it on). Webhook
 * mode without TELEGRAM_WEBHOOK_SECRET is refused: anyone could post fake updates.
 */
export function telegramSettings(config: ConfigService<Env, true>): TelegramSettings {
    const nodeEnv = config.get('NODE_ENV', { infer: true })
    const mode: TelegramMode =
        config.get('TELEGRAM_MODE', { infer: true }) ??
        (nodeEnv === 'production' ? 'webhook' : 'polling')
    const token = config.get('TELEGRAM_BOT_TOKEN', { infer: true })
    const explicit = config.get('TELEGRAM_ENABLED', { infer: true })

    if (explicit === false) {
        return {
            enabled: false,
            mode,
            reason: 'TELEGRAM_ENABLED=false',
            message: 'El bot está desactivado en la configuración del servidor (TELEGRAM_ENABLED).',
        }
    }
    if (!token) {
        return {
            enabled: false,
            mode,
            reason: 'TELEGRAM_BOT_TOKEN is not set',
            message: 'Falta configurar el token del bot (TELEGRAM_BOT_TOKEN) en el servidor.',
        }
    }
    if (explicit === undefined && nodeEnv === 'test') {
        return {
            enabled: false,
            mode,
            reason: 'NODE_ENV=test (set TELEGRAM_ENABLED=true to force it on)',
            message: 'El bot está apagado en el entorno de pruebas.',
        }
    }
    const webhookSecret = config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true }) ?? null
    if (mode === 'webhook' && !webhookSecret) {
        return {
            enabled: false,
            mode,
            reason: 'webhook mode requires TELEGRAM_WEBHOOK_SECRET',
            message:
                'El modo webhook necesita TELEGRAM_WEBHOOK_SECRET en el servidor. Configúralo y reinicia.',
        }
    }
    return {
        enabled: true,
        token,
        mode,
        webhookSecret,
        webhookUrl: `${config.get('PUBLIC_API_URL', { infer: true })}/api/${TELEGRAM_WEBHOOK_PATH}`,
        apiRoot: config.get('TELEGRAM_API_ROOT', { infer: true }),
    }
}
