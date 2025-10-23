/**
 * Smart Rate Limiting System
 * Provides intelligent rate limiting with adaptive algorithms and burst handling
 */

class SmartRateLimiter {
    constructor() {
        this.limiters = new Map();
        this.burstAllowances = new Map();
        this.adaptiveConfig = new Map();
        this.globalLimits = new Map();
        
        this.defaultConfig = {
            windowMs: 60000, // 1 minute
            maxRequests: 100,
            burstMultiplier: 1.5, // Allow 50% burst
            adaptiveWindow: 300000, // 5 minutes for adaptation
            minRequests: 10,
            maxRequests: 1000
        };
        
        this.startAdaptiveAdjustment();
        this.startCleanup();
    }

    /**
     * Checks if a request is allowed
     * @param {string} key - Rate limit key
     * @param {Object} options - Rate limit options
     * @returns {Promise<Object>} Rate limit result
     */
    async checkLimit(key, options = {}) {
        const config = this.getConfig(key, options);
        const now = Date.now();
        
        // Initialize limiter if not exists
        if (!this.limiters.has(key)) {
            this.limiters.set(key, {
                requests: [],
                lastReset: now,
                burstUsed: 0,
                adaptiveScore: 0
            });
        }
        
        const limiter = this.limiters.get(key);
        
        // Clean old requests outside window
        limiter.requests = limiter.requests.filter(
            timestamp => now - timestamp < config.windowMs
        );
        
        // Calculate burst allowance
        const burstAllowance = this.calculateBurstAllowance(key, config);
        const totalAllowed = config.maxRequests + burstAllowance;
        
        // Check if request is allowed
        if (limiter.requests.length < totalAllowed) {
            limiter.requests.push(now);
            limiter.burstUsed = Math.max(0, limiter.requests.length - config.maxRequests);
            
            return {
                allowed: true,
                remaining: totalAllowed - limiter.requests.length,
                resetTime: now + config.windowMs,
                burstUsed: limiter.burstUsed,
                adaptiveScore: limiter.adaptiveScore
            };
        } else {
            // Request denied
            const oldestRequest = Math.min(...limiter.requests);
            const resetTime = oldestRequest + config.windowMs;
            
            return {
                allowed: false,
                remaining: 0,
                resetTime,
                retryAfter: Math.max(0, resetTime - now),
                burstUsed: limiter.burstUsed,
                adaptiveScore: limiter.adaptiveScore
            };
        }
    }

    /**
     * Gets configuration for a key
     * @param {string} key - Rate limit key
     * @param {Object} options - Options
     * @returns {Object} Configuration
     */
    getConfig(key, options) {
        if (this.adaptiveConfig.has(key)) {
            return { ...this.defaultConfig, ...this.adaptiveConfig.get(key), ...options };
        }
        return { ...this.defaultConfig, ...options };
    }

    /**
     * Calculates burst allowance for a key
     * @param {string} key - Rate limit key
     * @param {Object} config - Configuration
     * @returns {number} Burst allowance
     */
    calculateBurstAllowance(key, config) {
        const limiter = this.limiters.get(key);
        if (!limiter) return 0;
        
        // Base burst allowance
        let allowance = Math.floor(config.maxRequests * config.burstMultiplier);
        
        // Reduce allowance based on recent burst usage
        if (limiter.burstUsed > 0) {
            const burstPenalty = Math.min(limiter.burstUsed * 0.1, allowance * 0.5);
            allowance -= burstPenalty;
        }
        
        // Adaptive adjustment based on usage patterns
        if (limiter.adaptiveScore > 0) {
            allowance *= (1 + limiter.adaptiveScore * 0.1);
        }
        
        return Math.max(0, Math.floor(allowance));
    }

    /**
     * Records a successful request
     * @param {string} key - Rate limit key
     * @param {number} responseTime - Response time in ms
     */
    recordSuccess(key, responseTime = 0) {
        if (!this.limiters.has(key)) return;
        
        const limiter = this.limiters.get(key);
        
        // Update adaptive score based on performance
        if (responseTime > 0) {
            if (responseTime < 1000) {
                limiter.adaptiveScore += 0.1; // Fast response, increase allowance
            } else if (responseTime > 5000) {
                limiter.adaptiveScore -= 0.1; // Slow response, decrease allowance
            }
            
            // Keep adaptive score within bounds
            limiter.adaptiveScore = Math.max(-1, Math.min(1, limiter.adaptiveScore));
        }
    }

    /**
     * Records a failed request
     * @param {string} key - Rate limit key
     * @param {string} reason - Failure reason
     */
    recordFailure(key, reason = 'unknown') {
        if (!this.limiters.has(key)) return;
        
        const limiter = this.limiters.get(key);
        
        // Decrease adaptive score for failures
        limiter.adaptiveScore -= 0.2;
        limiter.adaptiveScore = Math.max(-1, limiter.adaptiveScore);
        
        // Track failure patterns
        if (!limiter.failures) {
            limiter.failures = new Map();
        }
        
        const failures = limiter.failures.get(reason) || 0;
        limiter.failures.set(reason, failures + 1);
    }

    /**
     * Starts adaptive adjustment process
     */
    startAdaptiveAdjustment() {
        setInterval(() => {
            this.runAdaptiveAdjustment();
        }, 300000); // Every 5 minutes
    }

    /**
     * Runs adaptive adjustment for all limiters
     */
    runAdaptiveAdjustment() {
        for (const [key, limiter] of this.limiters.entries()) {
            this.adjustLimitsForKey(key, limiter);
        }
    }

    /**
     * Adjusts limits for a specific key based on usage patterns
     * @param {string} key - Rate limit key
     * @param {Object} limiter - Limiter data
     */
    adjustLimitsForKey(key, limiter) {
        const now = Date.now();
        const config = this.getConfig(key);
        
        // Analyze usage patterns
        const recentRequests = limiter.requests.filter(
            timestamp => now - timestamp < config.adaptiveWindow
        );
        
        const avgRequestsPerMinute = recentRequests.length / (config.adaptiveWindow / 60000);
        
        // Adjust limits based on usage
        if (!this.adaptiveConfig.has(key)) {
            this.adaptiveConfig.set(key, { ...config });
        }
        
        const adaptiveConfig = this.adaptiveConfig.get(key);
        
        if (avgRequestsPerMinute > config.maxRequests * 0.8) {
            // High usage - increase limits gradually
            adaptiveConfig.maxRequests = Math.min(
                config.maxRequests * 1.2,
                this.defaultConfig.maxRequests
            );
        } else if (avgRequestsPerMinute < config.maxRequests * 0.3) {
            // Low usage - decrease limits to be more efficient
            adaptiveConfig.maxRequests = Math.max(
                config.maxRequests * 0.8,
                this.defaultConfig.minRequests
            );
        }
        
        // Adjust burst multiplier based on success rate
        if (limiter.adaptiveScore > 0.5) {
            adaptiveConfig.burstMultiplier = Math.min(2.0, config.burstMultiplier * 1.1);
        } else if (limiter.adaptiveScore < -0.5) {
            adaptiveConfig.burstMultiplier = Math.max(0.5, config.burstMultiplier * 0.9);
        }
    }

    /**
     * Starts cleanup process
     */
    startCleanup() {
        setInterval(() => {
            this.cleanup();
        }, 600000); // Every 10 minutes
    }

    /**
     * Cleans up old limiter data
     */
    cleanup() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        for (const [key, limiter] of this.limiters.entries()) {
            // Remove old requests
            limiter.requests = limiter.requests.filter(
                timestamp => now - timestamp < maxAge
            );
            
            // Remove limiters with no recent activity
            if (limiter.requests.length === 0 && now - limiter.lastReset > maxAge) {
                this.limiters.delete(key);
                this.adaptiveConfig.delete(key);
            }
        }
    }

    /**
     * Gets rate limit statistics
     * @returns {Object} Statistics
     */
    getStats() {
        const stats = {
            totalLimiters: this.limiters.size,
            activeLimiters: 0,
            totalRequests: 0,
            averageRequestsPerLimiter: 0,
            adaptiveConfigs: this.adaptiveConfig.size
        };
        
        for (const [key, limiter] of this.limiters.entries()) {
            if (limiter.requests.length > 0) {
                stats.activeLimiters++;
                stats.totalRequests += limiter.requests.length;
            }
        }
        
        if (stats.activeLimiters > 0) {
            stats.averageRequestsPerLimiter = stats.totalRequests / stats.activeLimiters;
        }
        
        return stats;
    }

    /**
     * Gets detailed statistics for a specific key
     * @param {string} key - Rate limit key
     * @returns {Object} Detailed statistics
     */
    getKeyStats(key) {
        if (!this.limiters.has(key)) {
            return null;
        }
        
        const limiter = this.limiters.get(key);
        const config = this.getConfig(key);
        const now = Date.now();
        
        const recentRequests = limiter.requests.filter(
            timestamp => now - timestamp < config.windowMs
        );
        
        return {
            key,
            currentRequests: recentRequests.length,
            maxRequests: config.maxRequests,
            burstAllowance: this.calculateBurstAllowance(key, config),
            adaptiveScore: limiter.adaptiveScore,
            burstUsed: limiter.burstUsed,
            failures: limiter.failures ? Object.fromEntries(limiter.failures) : {},
            config: this.adaptiveConfig.get(key) || config
        };
    }

    /**
     * Resets rate limit for a key
     * @param {string} key - Rate limit key
     */
    reset(key) {
        if (this.limiters.has(key)) {
            this.limiters.delete(key);
        }
        if (this.adaptiveConfig.has(key)) {
            this.adaptiveConfig.delete(key);
        }
    }

    /**
     * Resets all rate limits
     */
    resetAll() {
        this.limiters.clear();
        this.adaptiveConfig.clear();
        this.burstAllowances.clear();
    }
}

// Create singleton instance
const smartRateLimiter = new SmartRateLimiter();

module.exports = {
    SmartRateLimiter,
    smartRateLimiter
};
