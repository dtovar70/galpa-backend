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
    /** Code of an active topic of `contact_topics`, and its label there. */
    topic: string
    topicLabel: string
    /** Code and label of the space type (`space_types`), or null when not given. */
    spaceType: string | null
    spaceTypeLabel: string | null
    areaM2: number | null
    /** The product the customer asked about, when they wrote from its page. */
    product: { slug: string; name: string; url: string } | null
    message: string
    /** ISO instant. */
    receivedAt: string
}
