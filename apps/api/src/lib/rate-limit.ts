// Failed-attempt limiter for password sign-in: after `max` failures for a key
// within `windowMs`, the key is blocked until the oldest of them leaves the
// window. A success clears the key. In memory on purpose (single API
// instance, demo scale): a restart forgets the counts.

export class FailureLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  private recent(key: string, now: number): number[] {
    const kept = (this.failures.get(key) ?? []).filter((at) => at > now - this.windowMs);
    if (kept.length > 0) this.failures.set(key, kept);
    else this.failures.delete(key);
    return kept;
  }

  /** Milliseconds until `key` may try again (0 when it isn't blocked). */
  blockedFor(key: string, now = Date.now()): number {
    const recent = this.recent(key, now);
    return recent.length < this.max ? 0 : recent[recent.length - this.max] + this.windowMs - now;
  }

  fail(key: string, now = Date.now()): void {
    this.failures.set(key, [...this.recent(key, now), now]);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}
