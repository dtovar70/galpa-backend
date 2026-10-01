import type { ContactTopic, SpaceType } from './contact.constants.js'

/**
 * Contact form events. Listeners (the Telegram bot) subscribe with `@OnEvent(...)`, so the
 * contact module never depends on how the message travels.
 */
export const CONTACT_EVENTS = {
    /** A customer sent the contact form (validated, not a honeypot hit). */
    messageReceived: 'contact.message_received',
} as const

export interface ContactMessageReceivedEvent {
    fullName: string
    email: string
    /** "0424-1234567", or null when the customer left it empty. */
    phone: string | null
    topic: ContactTopic
    spaceType: SpaceType | null
    areaM2: number | null
    /** The product the customer asked about, when they wrote from its page. */
    product: { slug: string; name: string; url: string } | null
    message: string
    /** ISO instant. */
    receivedAt: string
}
