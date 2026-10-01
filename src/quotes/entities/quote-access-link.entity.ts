import {
    Check,
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryColumn,
    type Relation,
} from 'typeorm'
import { Quote } from './quote.entity.js'

/**
 * One private link to the quote's PDF (`/api/quotes/COT-000045/pdf?t=<token>`), issued when the
 * quote is emailed or shared by WhatsApp. Like the order links, only the SHA-256 (hex) of the
 * token is stored.
 */
@Entity({ name: 'quote_access_links' })
@Index('quote_access_links_token_hash_key', ['tokenHash'], { unique: true })
@Index('quote_access_links_quote_id_idx', ['quoteId'])
@Check('quote_access_links_token_hash_check', `"token_hash" ~ '^[a-f0-9]{64}$'`)
export class QuoteAccessLink {
    @PrimaryColumn({ type: 'text', primaryKeyConstraintName: 'quote_access_links_pkey' })
    id: string

    @Column({ name: 'quote_id', type: 'text' })
    quoteId: string

    @ManyToOne(() => Quote, (quote) => quote.accessLinks, {
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
    })
    @JoinColumn({ name: 'quote_id', foreignKeyConstraintName: 'quote_access_links_quote_id_fkey' })
    quote: Relation<Quote>

    /** SHA-256 (hex) of the token; the token itself is never stored. */
    @Column({ name: 'token_hash', type: 'text', select: false })
    tokenHash: string

    @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
    createdAt: Date
}
