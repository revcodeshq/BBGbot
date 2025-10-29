/**
 * Advanced Caching System with Intelligent Eviction
 * Provides multi-level caching with predictive eviction and cache warming
 */

class AdvancedCacheManager {
    constructor() {
        this.caches = {
            // L1: Hot cache (frequently accessed, small size)
            hot: new Map(),
            // L2: Warm cache (moderately accessed, medium size)
            warm: new Map(),
            // L3: Cold cache (rarely accessed, large size)
            cold: new Map()
        };
        
        this.accessPatterns = new Map();
        this.evictionStats = new Map();
        this.cacheConfig = {
            hot: { maxSize: 100, ttl: 60000 }, // 1 minute
            warm: { maxSize: 1000, ttl: 300000 }, // 5 minutes
            cold: { maxSize: 10000, ttl: 1800000 } // 30 minutes
        };
        
        this.startIntelligentEviction();
        this.startCacheWarming();
    }

    /**
     * Gets a value from cache with intelligent tier selection
     * @param {string} key - Cache key
     * @returns {*} Cached value or undefined
     */
    get(key) {
        // Check all cache tiers
        for (const [tier, cache] of Object.entries(this.caches)) {
            const entry = cache.get(key);
            if (entry && this.isValid(entry)) {
                this.updateAccessPattern(key, tier);
                this.promoteEntry(key, entry, tier);
                return entry.value;
            }
        }
        
        this.updateAccessPattern(key, 'miss');
        return undefined;
    }

    /**
     * Sets a value in cache with intelligent tier placement
     * @param {string} key - Cache key
     * @param {*} value - Value to cache
     * @param {Object} options - Cache options
     */
    set(key, value, options = {}) {
        const {
            ttl = this.cacheConfig.warm.ttl,
            priority = 'normal',
            tier = this.selectTier(key, priority)
        } = options;

        const entry = {
            value,
            timestamp: Date.now(),
            ttl,
            accessCount: 0,
            lastAccess: Date.now(),
            priority
        };

        // Ensure tier has space
        this.ensureSpace(tier);
        
        // Store in selected tier
        this.caches[tier].set(key, entry);
        this.updateAccessPattern(key, tier);
    }

    /**
     * Selects appropriate cache tier based on key and priority
     * @param {string} key - Cache key
     * @param {string} priority - Priority level
     * @returns {string} Selected tier
     */
    selectTier(key, priority) {
        const pattern = this.accessPatterns.get(key);
        
        if (priority === 'high' || (pattern && pattern.accessCount > 10)) {
            return 'hot';
        } else if (priority === 'low' || (pattern && pattern.accessCount < 3)) {
            return 'cold';
        } else {
            return 'warm';
        }
    }

    /**
     * Promotes an entry to a higher tier if it's frequently accessed
     * @param {string} key - Cache key
     * @param {Object} entry - Cache entry
     * @param {string} currentTier - Current tier
     */
    promoteEntry(key, entry, currentTier) {
        entry.accessCount++;
        entry.lastAccess = Date.now();
        
        const pattern = this.accessPatterns.get(key);
        if (pattern) {
            pattern.accessCount++;
            pattern.lastAccess = Date.now();
        }

        // Promote to hot cache if frequently accessed
        if (entry.accessCount > 5 && currentTier !== 'hot') {
            this.moveToTier(key, entry, 'hot');
        }
        // Promote to warm cache if moderately accessed
        else if (entry.accessCount > 2 && currentTier === 'cold') {
            this.moveToTier(key, entry, 'warm');
        }
    }

    /**
     * Moves an entry to a different tier
     * @param {string} key - Cache key
     * @param {Object} entry - Cache entry
     * @param {string} targetTier - Target tier
     */
    moveToTier(key, entry, targetTier) {
        // Remove from current tier
        for (const [, cache] of Object.entries(this.caches)) {
            if (cache.has(key)) {
                cache.delete(key);
                break;
            }
        }

        // Ensure target tier has space
        this.ensureSpace(targetTier);
        
        // Add to target tier
        this.caches[targetTier].set(key, entry);
    }

    /**
     * Ensures a tier has space by evicting entries if necessary
     * @param {string} tier - Cache tier
     */
    ensureSpace(tier) {
        const cache = this.caches[tier];
        const maxSize = this.cacheConfig[tier].maxSize;
        
        if (cache.size >= maxSize) {
            this.evictFromTier(tier, Math.ceil(maxSize * 0.1)); // Evict 10%
        }
    }

    /**
     * Evicts entries from a specific tier using intelligent algorithms
     * @param {string} tier - Cache tier
     * @param {number} count - Number of entries to evict
     */
    evictFromTier(tier, count) {
        const cache = this.caches[tier];
        const entries = Array.from(cache.entries());
        
        // Sort by eviction score (lower is better to keep)
        entries.sort((a, b) => {
            const scoreA = this.calculateEvictionScore(a[0], a[1]);
            const scoreB = this.calculateEvictionScore(b[0], b[1]);
            return scoreA - scoreB;
        });

        // Evict entries with highest scores
        for (let i = 0; i < Math.min(count, entries.length); i++) {
            const [key, entry] = entries[i];
            cache.delete(key);
            this.trackEviction(key, tier, entry);
        }
    }

    /**
     * Calculates eviction score for an entry (lower = keep, higher = evict)
     * @param {string} key - Cache key
     * @param {Object} entry - Cache entry
     * @returns {number} Eviction score
     */
    calculateEvictionScore(key, entry) {
        const now = Date.now();
        const age = now - entry.timestamp;
        const timeSinceAccess = now - entry.lastAccess;
        
        // Base score from access frequency and recency
        let score = 0;
        
        // Lower access count = higher score (evict less used)
        score += (10 - Math.min(entry.accessCount, 10)) * 10;
        
        // Older entries = higher score (evict older)
        score += Math.min(age / 60000, 100); // Age in minutes, capped at 100
        
        // Longer since last access = higher score (evict stale)
        score += Math.min(timeSinceAccess / 30000, 50); // Time since access in 30s units
        
        // Priority adjustment
        if (entry.priority === 'high') score -= 50;
        else if (entry.priority === 'low') score += 20;
        
        return score;
    }

    /**
     * Updates access pattern for a key
     * @param {string} key - Cache key
     * @param {string} tier - Cache tier or 'miss'
     */
    updateAccessPattern(key, tier) {
        if (!this.accessPatterns.has(key)) {
            this.accessPatterns.set(key, {
                accessCount: 0,
                lastAccess: Date.now(),
                tierHistory: [],
                missCount: 0
            });
        }
        
        const pattern = this.accessPatterns.get(key);
        pattern.lastAccess = Date.now();
        
        if (tier === 'miss') {
            pattern.missCount++;
        } else {
            pattern.accessCount++;
            pattern.tierHistory.push({ tier, timestamp: Date.now() });
            
            // Keep only last 20 tier changes
            if (pattern.tierHistory.length > 20) {
                pattern.tierHistory.shift();
            }
        }
    }

    /**
     * Tracks eviction statistics
     * @param {string} key - Cache key
     * @param {string} tier - Cache tier
     * @param {Object} entry - Cache entry
     */
    trackEviction(key, tier, entry) {
        if (!this.evictionStats.has(tier)) {
            this.evictionStats.set(tier, {
                totalEvictions: 0,
                avgAccessCount: 0,
                avgAge: 0
            });
        }
        
        const stats = this.evictionStats.get(tier);
        stats.totalEvictions++;
        stats.avgAccessCount = (stats.avgAccessCount + entry.accessCount) / 2;
        stats.avgAge = (stats.avgAge + (Date.now() - entry.timestamp)) / 2;
    }

    /**
     * Checks if a cache entry is still valid
     * @param {Object} entry - Cache entry
     * @returns {boolean} True if valid
     */
    isValid(entry) {
        return Date.now() - entry.timestamp < entry.ttl;
    }

    /**
     * Starts intelligent eviction process
     */
    startIntelligentEviction() {
        // Run eviction every 2 minutes
        setInterval(() => {
            this.runIntelligentEviction();
        }, 120000);
    }

    /**
     * Runs intelligent eviction across all tiers
     */
    runIntelligentEviction() {
        for (const [tier, cache] of Object.entries(this.caches)) {
            const maxSize = this.cacheConfig[tier].maxSize;
            const currentSize = cache.size;
            
            // If cache is 90% full, evict 20%
            if (currentSize >= maxSize * 0.9) {
                const evictCount = Math.ceil(maxSize * 0.2);
                this.evictFromTier(tier, evictCount);
            }
        }
    }

    /**
     * Starts cache warming process
     */
    startCacheWarming() {
        // Run cache warming every 5 minutes
        setInterval(() => {
            this.warmCache();
        }, 300000);
    }

    /**
     * Warms cache with frequently accessed patterns
     */
    warmCache() {
        // Find keys that are frequently accessed but not in cache
        const frequentKeys = Array.from(this.accessPatterns.entries())
            .filter(([, pattern]) => pattern.accessCount > 3 && pattern.missCount > 0)
            .sort((a, b) => b[1].accessCount - a[1].accessCount)
            .slice(0, 10); // Top 10 frequent keys

        // This would typically trigger cache warming for these keys
        // Implementation depends on specific use case
        if (frequentKeys.length > 0) {
            console.log(`[Cache Warming] Warming ${frequentKeys.length} frequently accessed keys`);
        }
    }

    /**
     * Gets cache statistics
     * @returns {Object} Cache statistics
     */
    getStats() {
        const stats = {
            tiers: {},
            totalSize: 0,
            hitRate: 0,
            evictionStats: {}
        };

        let totalAccess = 0;
        let totalMisses = 0;

        for (const [tier, cache] of Object.entries(this.caches)) {
            stats.tiers[tier] = {
                size: cache.size,
                maxSize: this.cacheConfig[tier].maxSize,
                utilization: (cache.size / this.cacheConfig[tier].maxSize) * 100
            };
            stats.totalSize += cache.size;
        }

        // Calculate hit rate
        for (const [, pattern] of this.accessPatterns.entries()) {
            totalAccess += pattern.accessCount;
            totalMisses += pattern.missCount;
        }

        if (totalAccess + totalMisses > 0) {
            stats.hitRate = (totalAccess / (totalAccess + totalMisses)) * 100;
        }

        // Add eviction stats
        for (const [tier, evictionStats] of this.evictionStats.entries()) {
            stats.evictionStats[tier] = evictionStats;
        }

        return stats;
    }

    /**
     * Clears all caches
     */
    clear() {
        for (const cache of Object.values(this.caches)) {
            cache.clear();
        }
        this.accessPatterns.clear();
        this.evictionStats.clear();
    }

    /**
     * Cleans up expired entries
     */
    cleanup() {
        for (const [, cache] of Object.entries(this.caches)) {
            for (const [key, entry] of cache.entries()) {
                if (!this.isValid(entry)) {
                    cache.delete(key);
                }
            }
        }
    }
}

// Create singleton instance
const advancedCache = new AdvancedCacheManager();

// Cleanup expired entries every 5 minutes
setInterval(() => {
    advancedCache.cleanup();
}, 300000);

module.exports = {
    AdvancedCacheManager,
    advancedCache
};
