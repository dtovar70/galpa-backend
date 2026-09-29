/** Every way a reset code can travel. */
export const PASSWORD_RESET_CHANNELS = ['telegram', 'email'] as const
export type PasswordResetChannelId = (typeof PASSWORD_RESET_CHANNELS)[number]

/** The account a code is for (never the password hash). */
export interface PasswordResetRecipient {
    id: string
    name: string
    email: string
}

/**
 * A way to deliver password reset codes. The flow (codes, attempts, expiry, the password
 * change) lives in `PasswordResetService`; a channel only knows whether it can reach a user and
 * how to send them the two messages. A new channel only needs adding to
 * `PASSWORD_RESET_CHANNEL_LIST`.
 */
export interface PasswordResetChannel {
    readonly id: PasswordResetChannelId
    /** Whether a code sent now would reach the user (e.g. Telegram: bot on + an active chat). */
    canReach(user: PasswordResetRecipient): Promise<boolean>
    /** Sends the code; resolves with how many destinations got it (0: nothing arrived). */
    sendCode(user: PasswordResetRecipient, code: string, ttlMinutes: number): Promise<number>
    /** "Your password changed" notice after a successful reset. */
    sendPasswordChanged(user: PasswordResetRecipient): Promise<void>
}

/** Injection token: the channels, in order of preference (the first that can reach wins). */
export const PASSWORD_RESET_CHANNEL_LIST = Symbol('PASSWORD_RESET_CHANNEL_LIST')
