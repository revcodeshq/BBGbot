/**
 * Caching System
 * Provides caching functionality for API calls and frequent operations
 */

class CacheManager {
    constructor() {
        this.cache = new Map();
        this.ttl = new Map(); // Time-to-live tracking
        this.accessTimes = new Map(); // Track access times for LRU
        this.defaultTTL = 300000; // 5 minutes default
        this.maxSize = 10000; // Maximum cache entries
        this.cleanupInterval = null;
        this.startCleanupTimer();
    }

    /**
     * Starts automatic cleanup timer
     */
    startCleanupTimer() {
        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 300000); // Clean every 5 minutes
    }

    /**
     * Stops cleanup timer
     */
    stopCleanupTimer() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Sets a value in cache with TTL and LRU management
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {number} ttl - Time to live in milliseconds
     */
    set(key, value, ttl = this.defaultTTL) {
        // Check if we need to evict entries due to size limit
        if (this.cache.size >= this.maxSize) {
            this.evictLRU();
        }

        this.cache.set(key, value);
        this.ttl.set(key, Date.now() + ttl);
        this.accessTimes.set(key, Date.now());
    }

    /**
     * Gets a value from cache and updates access time
     * @param {string} key - Cache key
     * @returns {*} Cached value or undefined
     */
    get(key) {
        const expiry = this.ttl.get(key);
        if (!expiry || Date.now() > expiry) {
            this.delete(key);
            return undefined;
        }
        
        // Update access time for LRU
        this.accessTimes.set(key, Date.now());
        return this.cache.get(key);
    }

    /**
     * Deletes a key from cache
     * @param {string} key - Cache key
     */
    delete(key) {
        this.cache.delete(key);
        this.ttl.delete(key);
        this.accessTimes.delete(key);
    }

    /**
     * Evicts least recently used entries when cache is full
     */
    evictLRU() {
        const entries = Array.from(this.accessTimes.entries());
        entries.sort((a, b) => a[1] - b[1]); // Sort by access time
        
        // Remove oldest 10% of entries
        const toRemove = Math.ceil(entries.length * 0.1);
        for (let i = 0; i < toRemove; i++) {
            const [key] = entries[i];
            this.delete(key);
        }
    }

    /**
     * Clears all cache entries
     */
    clear() {
        this.cache.clear();
        this.ttl.clear();
        this.accessTimes.clear();
    }

    /**
     * Checks if a key exists and is not expired
     * @param {string} key - Cache key
     * @returns {boolean} True if key exists and is valid
     */
    has(key) {
        const expiry = this.ttl.get(key);
        if (!expiry || Date.now() > expiry) {
            this.delete(key);
            return false;
        }
        return this.cache.has(key);
    }

    /**
     * Gets enhanced cache statistics
     * @returns {Object} Cache statistics
     */
    getStats() {
        const now = Date.now();
        let expired = 0;
        let totalAccessTime = 0;
        let minAccessTime = Infinity;
        let maxAccessTime = 0;
        
        for (const [, expiry] of this.ttl.entries()) {
            if (now > expiry) {
                expired++;
            }
        }

        for (const [, accessTime] of this.accessTimes.entries()) {
            totalAccessTime += accessTime;
            minAccessTime = Math.min(minAccessTime, accessTime);
            maxAccessTime = Math.max(maxAccessTime, accessTime);
        }

        const avgAccessTime = this.accessTimes.size > 0 ? totalAccessTime / this.accessTimes.size : 0;

        return {
            totalKeys: this.cache.size,
            expiredKeys: expired,
            validKeys: this.cache.size - expired,
            maxSize: this.maxSize,
            utilizationPercent: (this.cache.size / this.maxSize) * 100,
            avgAccessTime: Math.round(avgAccessTime),
            oldestAccess: minAccessTime === Infinity ? 0 : minAccessTime,
            newestAccess: maxAccessTime,
            memoryUsage: process.memoryUsage().heapUsed
        };
    }

    /**
     * Cleans up expired entries
     */
    cleanup() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [key, expiry] of this.ttl.entries()) {
            if (now > expiry) {
                this.delete(key);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`[Cache Cleanup] Removed ${cleanedCount} expired entries`);
        }
    }
}

// Create singleton instance
const cache = new CacheManager();

// Cleanup expired entries every 5 minutes
setInterval(() => {
    cache.cleanup();
}, 300000);

/**
 * Cache decorator for functions
 * @param {Function} fn - Function to cache
 * @param {number} ttl - Time to live in milliseconds
 * @param {Function} keyGenerator - Function to generate cache key from arguments
 * @returns {Function} Cached function
 */
function cacheDecorator(fn, ttl = 300000, keyGenerator = (...args) => JSON.stringify(args)) {
    return async (...args) => {
        const key = keyGenerator(...args);
        
        // Check cache first
        const cached = cache.get(key);
        if (cached !== undefined) {
            return cached;
        }

        // Execute function and cache result
        const result = await fn(...args);
        cache.set(key, result, ttl);
        return result;
    };
}

/**
 * API-specific cache helpers
 */
const apiCache = {
    /**
     * Caches player data with 10-minute TTL
     * @param {string} fid - Player FID
     * @param {Function} fetchFn - Function to fetch data if not cached
     * @returns {Promise<Object>} Player data
     */
    async getPlayerData(fid, fetchFn) {
        const key = `player_${fid}`;
        const cached = cache.get(key);
        if (cached) return cached;

        const data = await fetchFn();
        cache.set(key, data, 600000); // 10 minutes
        return data;
    },

    /**
     * Caches translation results with 1-hour TTL
     * @param {string} text - Text to translate
     * @param {string} targetLang - Target language
     * @param {Function} translateFn - Function to translate if not cached
     * @returns {Promise<string>} Translated text
     */
    async getTranslation(text, targetLang, translateFn) {
        const key = `translation_${targetLang}_${Buffer.from(text).toString('base64')}`;
        const cached = cache.get(key);
        if (cached) return cached;

        const result = await translateFn();
        cache.set(key, result, 3600000); // 1 hour
        return result;
    },

    /**
     * Caches guild member data with 5-minute TTL
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {Function} fetchFn - Function to fetch member if not cached
     * @returns {Promise<Object>} Member data
     */
    async getMemberData(guildId, userId, fetchFn) {
        const key = `member_${guildId}_${userId}`;
        const cached = cache.get(key);
        if (cached) return cached;

        const member = await fetchFn();
        cache.set(key, member, 300000); // 5 minutes
        return member;
    }
};

module.exports = {
    cache,
    cacheDecorator,
    apiCache,
    CacheManager
};
