// Cache Service
// Redis for production, in-memory fallback for development
// Handles session caching, output caching, and rate limit state

import Redis from 'ioredis';

let redis = null;
let useRedis = false;

// In-memory cache fallback
const memoryCache = new Map();
const memoryCacheTTL = new Map(); // key -> expiry timestamp

// ============================================================================
// INITIALIZATION
// ============================================================================

export async function initCache() {
  const redisUrl = process.env.REDIS_URL;
  
  if (redisUrl) {
    try {
      redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        lazyConnect: true,
        // Connection timeout
        connectTimeout: 10000,
        // Enable TLS for production Redis (Render, etc.)
        tls: redisUrl.startsWith('rediss://') ? {} : undefined,
      });

      await redis.ping();
      useRedis = true;
      console.log('[Cache] Connected to Redis');

      // Handle Redis errors gracefully
      redis.on('error', (err) => {
        console.error('[Cache] Redis error:', err.message);
        // Don't crash, fall back to memory cache
      });

      redis.on('reconnecting', () => {
        console.log('[Cache] Reconnecting to Redis...');
      });

      return true;
    } catch (error) {
      console.warn('[Cache] Failed to connect to Redis, using in-memory cache:', error.message);
      useRedis = false;
      return false;
    }
  } else {
    console.log('[Cache] No REDIS_URL configured, using in-memory cache');
    console.log('[Cache] ⚠️  Cache will not persist across server restarts');
    useRedis = false;
    return false;
  }
}

export async function closeCache() {
  if (redis) {
    await redis.quit();
    console.log('[Cache] Disconnected from Redis');
  }
}

// ============================================================================
// MEMORY CACHE HELPERS
// ============================================================================

function cleanupExpiredMemoryCache() {
  const now = Date.now();
  for (const [key, expiry] of memoryCacheTTL.entries()) {
    if (expiry && expiry < now) {
      memoryCache.delete(key);
      memoryCacheTTL.delete(key);
    }
  }
}

// Cleanup expired entries every minute
setInterval(cleanupExpiredMemoryCache, 60 * 1000);

// ============================================================================
// CACHE OPERATIONS
// ============================================================================

export const cache = {
  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<any>} - Cached value or null
   */
  async get(key) {
    try {
      if (useRedis) {
        const value = await redis.get(key);
        return value ? JSON.parse(value) : null;
      } else {
        // Check expiry for memory cache
        const expiry = memoryCacheTTL.get(key);
        if (expiry && expiry < Date.now()) {
          memoryCache.delete(key);
          memoryCacheTTL.delete(key);
          return null;
        }
        return memoryCache.get(key) || null;
      }
    } catch (error) {
      console.error('[Cache] Get error:', error.message);
      return null;
    }
  },

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlSeconds - Time to live in seconds (optional)
   */
  async set(key, value, ttlSeconds = null) {
    try {
      if (useRedis) {
        const serialized = JSON.stringify(value);
        if (ttlSeconds) {
          await redis.setex(key, ttlSeconds, serialized);
        } else {
          await redis.set(key, serialized);
        }
      } else {
        memoryCache.set(key, value);
        if (ttlSeconds) {
          memoryCacheTTL.set(key, Date.now() + (ttlSeconds * 1000));
        } else {
          memoryCacheTTL.delete(key); // No expiry
        }
      }
    } catch (error) {
      console.error('[Cache] Set error:', error.message);
    }
  },

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   */
  async del(key) {
    try {
      if (useRedis) {
        await redis.del(key);
      } else {
        memoryCache.delete(key);
        memoryCacheTTL.delete(key);
      }
    } catch (error) {
      console.error('[Cache] Delete error:', error.message);
    }
  },

  /**
   * Delete multiple keys matching a pattern
   * @param {string} pattern - Key pattern (e.g., "user:123:*")
   */
  async delPattern(pattern) {
    try {
      if (useRedis) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } else {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        for (const key of memoryCache.keys()) {
          if (regex.test(key)) {
            memoryCache.delete(key);
            memoryCacheTTL.delete(key);
          }
        }
      }
    } catch (error) {
      console.error('[Cache] Delete pattern error:', error.message);
    }
  },

  /**
   * Check if a key exists
   * @param {string} key - Cache key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    try {
      if (useRedis) {
        return (await redis.exists(key)) === 1;
      } else {
        const expiry = memoryCacheTTL.get(key);
        if (expiry && expiry < Date.now()) {
          memoryCache.delete(key);
          memoryCacheTTL.delete(key);
          return false;
        }
        return memoryCache.has(key);
      }
    } catch (error) {
      console.error('[Cache] Exists error:', error.message);
      return false;
    }
  },

  /**
   * Get remaining TTL for a key
   * @param {string} key - Cache key
   * @returns {Promise<number>} - TTL in seconds, -1 if no expiry, -2 if key doesn't exist
   */
  async ttl(key) {
    try {
      if (useRedis) {
        return await redis.ttl(key);
      } else {
        const expiry = memoryCacheTTL.get(key);
        if (!memoryCache.has(key)) return -2;
        if (!expiry) return -1;
        return Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      }
    } catch (error) {
      console.error('[Cache] TTL error:', error.message);
      return -2;
    }
  },

  /**
   * Increment a counter
   * @param {string} key - Cache key
   * @param {number} amount - Amount to increment (default 1)
   * @returns {Promise<number>} - New value
   */
  async incr(key, amount = 1) {
    try {
      if (useRedis) {
        return await redis.incrby(key, amount);
      } else {
        const current = memoryCache.get(key) || 0;
        const newValue = current + amount;
        memoryCache.set(key, newValue);
        return newValue;
      }
    } catch (error) {
      console.error('[Cache] Incr error:', error.message);
      return 0;
    }
  },

  /**
   * Set expiry on existing key
   * @param {string} key - Cache key
   * @param {number} ttlSeconds - Time to live in seconds
   */
  async expire(key, ttlSeconds) {
    try {
      if (useRedis) {
        await redis.expire(key, ttlSeconds);
      } else {
        if (memoryCache.has(key)) {
          memoryCacheTTL.set(key, Date.now() + (ttlSeconds * 1000));
        }
      }
    } catch (error) {
      console.error('[Cache] Expire error:', error.message);
    }
  },

  /**
   * Check if using Redis
   */
  isUsingRedis() {
    return useRedis;
  },

  /**
   * Get cache stats
   */
  async getStats() {
    if (useRedis) {
      const info = await redis.info('stats');
      return { type: 'redis', info };
    } else {
      return {
        type: 'memory',
        keys: memoryCache.size,
        keysWithTTL: memoryCacheTTL.size,
      };
    }
  },
};

// ============================================================================
// SPECIALIZED CACHE HELPERS
// ============================================================================

export const cacheKeys = {
  // User session
  userSession: (userId) => `session:${userId}`,
  
  // Me output cache
  meOutput: (userId) => `me:output:${userId}`,
  
  // Relationship output cache
  relOutput: (userId) => `rel:output:${userId}`,
  
  // Tone rendered cache
  toneRendered: (userId, tone, type) => `tone:${userId}:${tone}:${type}`,
  
  // Character recognition cache
  charRecognition: (hash) => `char:recognition:${hash}`,
  
  // Rate limit counter
  rateLimit: (userId, action) => `rate:${action}:${userId}`,
  
  // Lock for concurrent operations
  lock: (resource) => `lock:${resource}`,
};

export const cachedOps = {
  /**
   * Get or set pattern - fetch from cache, or compute and cache
   * @param {string} key - Cache key
   * @param {Function} computeFn - Async function to compute value if not cached
   * @param {number} ttl - TTL in seconds (optional)
   */
  async getOrSet(key, computeFn, ttl = 300) {
    const cached = await cache.get(key);
    if (cached) {
      return cached;
    }

    const value = await computeFn();
    await cache.set(key, value, ttl);
    return value;
  },

  /**
   * Cache user session data
   */
  async cacheUserSession(userId, sessionData) {
    await cache.set(cacheKeys.userSession(userId), sessionData, 24 * 60 * 60); // 24 hours
  },

  /**
   * Get cached user session
   */
  async getUserSession(userId) {
    return cache.get(cacheKeys.userSession(userId));
  },

  /**
   * Invalidate all caches for a user
   */
  async invalidateUserCaches(userId) {
    await cache.delPattern(`*:${userId}:*`);
    await cache.delPattern(`*:${userId}`);
  },
};
