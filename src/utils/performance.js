/**
 * Performance Optimization Utilities
 * Provides batching, parallel processing, and rate limiting for API calls
 */

const { ErrorHandler, RateLimitError } = require('./error-handler');

class PerformanceOptimizer {
    constructor() {
        this.rateLimiters = new Map();
        this.batchQueues = new Map();
        this.cleanupInterval = null;
        this.startCleanupTimer();
    }

    /**
     * Starts automatic cleanup timer to prevent memory leaks
     */
    startCleanupTimer() {
        // Clean up every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanupMemory();
        }, 300000);
    }

    /**
     * Cleans up memory by removing expired entries
     */
    cleanupMemory() {
        const now = Date.now();
        let cleanedCount = 0;

        // Clean up rate limiters
        for (const [key, requests] of this.rateLimiters.entries()) {
            const validRequests = requests.filter(timestamp => now - timestamp < 300000); // 5 minutes
            if (validRequests.length === 0) {
                this.rateLimiters.delete(key);
                cleanedCount++;
            } else {
                this.rateLimiters.set(key, validRequests);
            }
        }

        // Clean up batch queues
        for (const [key, queue] of this.batchQueues.entries()) {
            if (queue.length === 0) {
                this.batchQueues.delete(key);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`[Memory Cleanup] Cleaned up ${cleanedCount} expired entries`);
        }
    }

    /**
     * Stops cleanup timer (call on shutdown)
     */
    stopCleanupTimer() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Implements exponential backoff retry mechanism
     * @param {Function} fn - Function to retry
     * @param {number} maxRetries - Maximum number of retries
     * @param {number} baseDelay - Base delay in milliseconds
     * @returns {Promise} Result of function execution
     */
    static async withExponentialBackoff(fn, maxRetries = 3, baseDelay = 1000) {
        let lastError;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (attempt === maxRetries || !ErrorHandler.shouldRetry(error)) {
                    throw error;
                }
                
                // Exponential backoff with jitter
                const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
                console.log(`[Retry] Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    }

    /**
     * Processes items in batches with parallel execution
     * @param {Array} items - Items to process
     * @param {Function} processor - Function to process each item
     * @param {number} batchSize - Size of each batch
     * @param {number} concurrency - Number of concurrent batches
     * @returns {Promise<Array>} Results of processing
     */
    static async processBatches(items, processor, batchSize = 10, concurrency = 3) {
        const results = [];
        const batches = this.chunkArray(items, batchSize);
        
        for (let i = 0; i < batches.length; i += concurrency) {
            const concurrentBatches = batches.slice(i, i + concurrency);
            const batchPromises = concurrentBatches.map(async (batch, _batchIndex) => {
                const batchResults = [];
                for (const item of batch) {
                    try {
                        const result = await processor(item);
                        batchResults.push({ success: true, result, item });
                    } catch (error) {
                        batchResults.push({ success: false, error, item });
                    }
                }
                return batchResults;
            });
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.flat());
        }
        
        return results;
    }

    /**
     * Implements circuit breaker pattern for API calls
     * @param {string} service - Service name
     * @param {Function} apiCall - API call function
     * @param {Object} options - Circuit breaker options
     * @returns {Promise} API call result
     */
    static async withCircuitBreaker(service, apiCall, options = {}) {
        const {
            failureThreshold = 5,
            timeout = 30000,
            resetTimeout = 60000
        } = options;

        if (!this.circuitBreakers) {
            this.circuitBreakers = new Map();
        }

        if (!this.circuitBreakers.has(service)) {
            this.circuitBreakers.set(service, {
                state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
                failureCount: 0,
                lastFailureTime: null,
                successCount: 0
            });
        }

        const breaker = this.circuitBreakers.get(service);
        const now = Date.now();

        // Check if circuit is open
        if (breaker.state === 'OPEN') {
            if (now - breaker.lastFailureTime > resetTimeout) {
                breaker.state = 'HALF_OPEN';
                breaker.successCount = 0;
            } else {
                throw new Error(`Circuit breaker is OPEN for ${service}. Service unavailable.`);
            }
        }

        try {
            const result = await Promise.race([
                apiCall(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('API call timeout')), timeout)
                )
            ]);

            // Success - reset failure count
            breaker.failureCount = 0;
            breaker.successCount++;
            
            if (breaker.state === 'HALF_OPEN' && breaker.successCount >= 3) {
                breaker.state = 'CLOSED';
            }

            return result;

        } catch (error) {
            breaker.failureCount++;
            breaker.lastFailureTime = now;

            if (breaker.failureCount >= failureThreshold) {
                breaker.state = 'OPEN';
            }

            throw error;
        }
    }

    /**
     * Implements rate limiting for API calls
     * @param {string} key - Rate limit key
     * @param {number} maxRequests - Maximum requests per window
     * @param {number} windowMs - Window size in milliseconds
     * @returns {Promise} Resolves when rate limit allows the request
     */
    static async rateLimit(key, maxRequests = 10, windowMs = 60000) {
        const now = Date.now();
        const windowStart = now - windowMs;

        if (!this.rateLimiters) {
            this.rateLimiters = new Map();
        }

        if (!this.rateLimiters.has(key)) {
            this.rateLimiters.set(key, []);
        }

        const requests = this.rateLimiters.get(key);
        
        // Remove old requests outside the window
        const validRequests = requests.filter(timestamp => timestamp > windowStart);
        this.rateLimiters.set(key, validRequests);

        if (validRequests.length >= maxRequests) {
            const oldestRequest = Math.min(...validRequests);
            const waitTime = oldestRequest + windowMs - now;
            throw new RateLimitError(`Rate limit exceeded for ${key}`, waitTime);
        }

        // Add current request
        validRequests.push(now);
        this.rateLimiters.set(key, validRequests);
    }

    /**
     * Optimizes nickname sync with batching and rate limiting
     * @param {Array} users - Users to sync
     * @param {Function} syncFunction - Function to sync individual user
     * @returns {Promise<Array>} Sync results
     */
    static async optimizeNicknameSync(users, syncFunction) {
        const batchSize = 5; // Smaller batches for API calls
        const concurrency = 2; // Limit concurrent API calls
        
        return await this.processBatches(users, async (user) => {
            // Apply rate limiting
            await this.rateLimit('nickname_sync', 10, 60000); // 10 requests per minute
            
            // Apply circuit breaker
            return await this.withCircuitBreaker('WOS_API', () => syncFunction(user), {
                failureThreshold: 3,
                timeout: 15000,
                resetTimeout: 30000
            });
        }, batchSize, concurrency);
    }

    /**
     * Optimizes API calls with caching and batching
     * @param {Array} requests - API requests to make
     * @param {Function} apiCall - Function to make API call
     * @param {Object} cache - Cache instance
     * @returns {Promise<Array>} API results
     */
    static async optimizeApiCalls(requests, apiCall, cache) {
        const results = [];
        const uncachedRequests = [];

        // Check cache first
        for (const request of requests) {
            const cacheKey = `api_${JSON.stringify(request)}`;
            const cached = cache.get(cacheKey);
            
            if (cached) {
                results.push({ success: true, result: cached, cached: true });
            } else {
                uncachedRequests.push({ request, cacheKey });
            }
        }

        // Process uncached requests in batches
        if (uncachedRequests.length > 0) {
            const batchResults = await this.processBatches(
                uncachedRequests,
                async ({ request, cacheKey }) => {
                    const result = await this.withExponentialBackoff(() => apiCall(request));
                    cache.set(cacheKey, result, 300000); // 5 minute cache
                    return { success: true, result, cached: false };
                },
                5, // Batch size
                2  // Concurrency
            );
            
            results.push(...batchResults);
        }

        return results;
    }

    /**
     * Utility function to chunk array into smaller arrays
     * @param {Array} array - Array to chunk
     * @param {number} size - Chunk size
     * @returns {Array} Array of chunks
     */
    static chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }

    /**
     * Debounces function calls
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @returns {Function} Debounced function
     */
    static debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * Throttles function calls
     * @param {Function} func - Function to throttle
     * @param {number} limit - Call limit per interval
     * @param {number} interval - Interval in milliseconds
     * @returns {Function} Throttled function
     */
    static throttle(func, limit, interval) {
        let inThrottle;
        let lastFunc;
        let lastRan;
        
        return function executedFunction(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                lastRan = Date.now();
                inThrottle = true;
            } else {
                clearTimeout(lastFunc);
                lastFunc = setTimeout(() => {
                    if ((Date.now() - lastRan) >= interval) {
                        func.apply(this, args);
                        lastRan = Date.now();
                    }
                }, interval - (Date.now() - lastRan));
            }
        };
    }
}

module.exports = PerformanceOptimizer;
