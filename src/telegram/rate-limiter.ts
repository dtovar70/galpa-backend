/**
 * In-memory sliding window per key (a chat id): at most `limit` hits every `windowMs`. Enough for
 * one API instance; the bot runs on one anyway (a second poller would conflict).
 */
export class SlidingWindowLimiter {
    private readonly hits = new Map<string, number[]>()

    constructor(
        private readonly limit: number,
        private readonly windowMs: number,
        private readonly now: () => number = Date.now,
    ) {}

    /** Records a hit; false when the key is over its limit (the hit is not counted then). */
    hit(key: string): boolean {
        const now = this.now()
        const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs)
        if (recent.length >= this.limit) {
            this.hits.set(key, recent)
            return false
        }
        recent.push(now)
        this.hits.set(key, recent)
        if (this.hits.size > 1000) this.prune(now)
        return true
    }

    private prune(now: number): void {
        for (const [key, times] of this.hits) {
            if (times.every((at) => now - at >= this.windowMs)) this.hits.delete(key)
        }
    }
}
