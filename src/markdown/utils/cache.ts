export interface Cache {
  /**
   * Look up a value. Async to support remote stores (e.g., Redis). In-memory
   * implementations should resolve immediately.
   */
  get<T = unknown>(key: string): Promise<T | undefined>;
  /**
   * Store a value. `ttlMs` is a hint for remote stores; providers enforce TTL
   * using their own metadata and should not rely solely on the cache to expire
   * entries.
   */
  set<T = unknown>(
    key: string,
    value: T,
    opts?: { ttlMs?: number }
  ): Promise<void>;
  /** Optional deletion hook, primarily used in tests or manual invalidation. */
  del?(key: string): Promise<void>;
}

/**
 * Simple in-memory cache fulfilling the `Cache` interface. TTL is honored
 * locally to keep semantics consistent even without an external store. The
 * provider still enforces TTL based on snapshot timestamps; this TTL acts as a
 * best-effort eviction for long-lived processes.
 */
const DEFAULT_PRUNE_EVERY = 1_000; // sweep every N set() ops

export class InMemoryCache implements Cache {
  private store = new Map<string, { value: unknown; expiresAt?: number }>();
  // Lightweight pruning counters to avoid unbounded growth in long-lived procs
  // Sweep expired entries every N set() operations.
  private ops = 0;
  private readonly pruneEvery = DEFAULT_PRUNE_EVERY;

  private pruneExpired(now: number = Date.now()): void {
    for (const [k, v] of this.store) {
      if (typeof v.expiresAt === 'number' && v.expiresAt <= now) {
        this.store.delete(k);
      }
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (typeof hit.expiresAt === 'number' && hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  async set<T>(
    key: string,
    value: T,
    opts?: { ttlMs?: number }
  ): Promise<void> {
    const expiresAt =
      opts?.ttlMs && opts.ttlMs > 0 ? Date.now() + opts.ttlMs : undefined;
    this.store.set(key, { value, expiresAt });
    // Periodically prune expired entries with negligible overhead
    if (++this.ops % this.pruneEvery === 0) {
      this.pruneExpired();
    }
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }
}
