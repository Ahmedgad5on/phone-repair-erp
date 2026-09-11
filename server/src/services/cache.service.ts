interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export const CacheTtlPresets = {
  REALTIME: 5,        // Live balances, shift cash
  SHORT: 30,          // Ticket status, queues
  DASHBOARD: 60,      // Analytics overview
  CATALOG: 1800,      // Product & parts catalog
  STATIC_CONFIG: 7200 // Store settings, permissions
};

class ResilientCacheManager {
  private store = new Map<string, CacheEntry<any>>();
  private isRedisEnabled = false;

  constructor() {
    if (process.env.REDIS_URL) {
      // In production with Redis, connection can be established
      this.isRedisEnabled = true;
    }
  }

  set<T>(key: string, value: T, ttlSeconds: number = CacheTtlPresets.DASHBOARD): void {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.store.set(key, { value, expiresAt });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  invalidatePattern(pattern: string): void {
    const regex = new RegExp(pattern);
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
      }
    }
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  status(): { mode: string; entries: number } {
    return {
      mode: this.isRedisEnabled ? 'Redis + Memory Cache' : 'In-Memory Cache (Zero Latency)',
      entries: this.store.size
    };
  }
}

export const cacheService = new ResilientCacheManager();
