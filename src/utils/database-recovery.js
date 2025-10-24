/**
 * Database Recovery System
 * Handles database operation failures and implements recovery strategies
 */

const { productionLogger } = require('./production-logger');
const mongodbManager = require('./mongodb-manager');

class DatabaseRecovery {
    constructor() {
        this.failureCounts = new Map();
        this.circuitBreakerStates = new Map();
        this.recoveryStrategies = new Map();
        this.maxFailures = 5;
        this.circuitBreakerTimeout = 60000; // 1 minute
        this.setupRecoveryStrategies();
    }

    /**
     * Sets up recovery strategies for different types of failures
     */
    setupRecoveryStrategies() {
        // Connection timeout recovery
        this.recoveryStrategies.set('timeout', {
            retryDelay: 2000,
            maxRetries: 3,
            backoffMultiplier: 2
        });

        // Connection refused recovery
        this.recoveryStrategies.set('ECONNREFUSED', {
            retryDelay: 5000,
            maxRetries: 5,
            backoffMultiplier: 1.5
        });

        // Server selection timeout recovery
        this.recoveryStrategies.set('serverSelection', {
            retryDelay: 3000,
            maxRetries: 4,
            backoffMultiplier: 2
        });

        // Network error recovery
        this.recoveryStrategies.set('network', {
            retryDelay: 1000,
            maxRetries: 6,
            backoffMultiplier: 1.8
        });
    }

    /**
     * Executes a database operation with comprehensive error recovery
     * @param {Function} operation - Database operation to execute
     * @param {string} operationName - Name of the operation for logging
     * @param {Object} options - Recovery options
     * @returns {Promise<any>} Operation result
     */
    async executeWithRecovery(operation, operationName = 'unknown', options = {}) {
        const startTime = Date.now();
        let lastError;
        let attempt = 0;
        const maxAttempts = options.maxRetries || 3;

        // Check circuit breaker
        if (this.isCircuitBreakerOpen(operationName)) {
            throw new Error(`Circuit breaker open for ${operationName}`);
        }

        while (attempt < maxAttempts) {
            attempt++;
            
            try {
                // Check MongoDB health before operation
                if (!await mongodbManager.isHealthy()) {
                    throw new Error('MongoDB connection not healthy');
                }

                const result = await operation();
                
                // Reset failure count on success
                this.resetFailureCount(operationName);
                
                const duration = Date.now() - startTime;
                productionLogger.info(`Database operation successful`, {
                    operation: operationName,
                    attempt,
                    duration
                });
                
                return result;

            } catch (error) {
                lastError = error;
                
                // Log the error
                productionLogger.error(`Database operation failed`, {
                    operation: operationName,
                    attempt,
                    error: error.message,
                    stack: error.stack
                });

                // Increment failure count
                this.incrementFailureCount(operationName);

                // Check if we should open circuit breaker
                if (this.shouldOpenCircuitBreaker(operationName)) {
                    this.openCircuitBreaker(operationName);
                    throw new Error(`Circuit breaker opened for ${operationName} due to repeated failures`);
                }

                // Determine recovery strategy
                const strategy = this.getRecoveryStrategy(error);
                
                if (attempt < maxAttempts && strategy) {
                    const delay = this.calculateRetryDelay(attempt, strategy);
                    console.log(`[Database Recovery] Retrying ${operationName} in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    break;
                }
            }
        }

        // All attempts failed
        productionLogger.error(`Database operation failed after ${maxAttempts} attempts`, {
            operation: operationName,
            finalError: lastError.message
        });

        throw lastError;
    }

    /**
     * Determines the appropriate recovery strategy for an error
     * @param {Error} error - Error to analyze
     * @returns {Object|null} Recovery strategy or null
     */
    getRecoveryStrategy(error) {
        const errorMessage = error.message.toLowerCase();
        
        if (errorMessage.includes('timeout')) {
            return this.recoveryStrategies.get('timeout');
        }
        
        if (errorMessage.includes('econnrefused')) {
            return this.recoveryStrategies.get('ECONNREFUSED');
        }
        
        if (errorMessage.includes('server selection')) {
            return this.recoveryStrategies.get('serverSelection');
        }
        
        if (errorMessage.includes('network') || errorMessage.includes('socket')) {
            return this.recoveryStrategies.get('network');
        }
        
        // Default strategy
        return {
            retryDelay: 2000,
            maxRetries: 3,
            backoffMultiplier: 2
        };
    }

    /**
     * Calculates retry delay with exponential backoff
     * @param {number} attempt - Current attempt number
     * @param {Object} strategy - Recovery strategy
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(attempt, strategy) {
        const baseDelay = strategy.retryDelay;
        const multiplier = strategy.backoffMultiplier;
        const jitter = Math.random() * 0.1; // Add 10% jitter
        
        return Math.floor(baseDelay * Math.pow(multiplier, attempt - 1) * (1 + jitter));
    }

    /**
     * Increments failure count for an operation
     * @param {string} operationName - Name of the operation
     */
    incrementFailureCount(operationName) {
        const current = this.failureCounts.get(operationName) || 0;
        this.failureCounts.set(operationName, current + 1);
    }

    /**
     * Resets failure count for an operation
     * @param {string} operationName - Name of the operation
     */
    resetFailureCount(operationName) {
        this.failureCounts.set(operationName, 0);
    }

    /**
     * Gets failure count for an operation
     * @param {string} operationName - Name of the operation
     * @returns {number} Failure count
     */
    getFailureCount(operationName) {
        return this.failureCounts.get(operationName) || 0;
    }

    /**
     * Checks if circuit breaker should be opened
     * @param {string} operationName - Name of the operation
     * @returns {boolean} True if circuit breaker should be opened
     */
    shouldOpenCircuitBreaker(operationName) {
        const failureCount = this.getFailureCount(operationName);
        return failureCount >= this.maxFailures;
    }

    /**
     * Opens circuit breaker for an operation
     * @param {string} operationName - Name of the operation
     */
    openCircuitBreaker(operationName) {
        this.circuitBreakerStates.set(operationName, {
            open: true,
            openedAt: Date.now()
        });
        
        console.warn(`[Database Recovery] Circuit breaker opened for ${operationName}`);
        
        // Auto-reset circuit breaker after timeout
        setTimeout(() => {
            this.closeCircuitBreaker(operationName);
        }, this.circuitBreakerTimeout);
    }

    /**
     * Closes circuit breaker for an operation
     * @param {string} operationName - Name of the operation
     */
    closeCircuitBreaker(operationName) {
        this.circuitBreakerStates.set(operationName, {
            open: false,
            closedAt: Date.now()
        });
        
        console.log(`[Database Recovery] Circuit breaker closed for ${operationName}`);
    }

    /**
     * Checks if circuit breaker is open for an operation
     * @param {string} operationName - Name of the operation
     * @returns {boolean} True if circuit breaker is open
     */
    isCircuitBreakerOpen(operationName) {
        const state = this.circuitBreakerStates.get(operationName);
        return state && state.open;
    }

    /**
     * Gets recovery statistics
     * @returns {Object} Recovery statistics
     */
    getRecoveryStats() {
        return {
            failureCounts: Object.fromEntries(this.failureCounts),
            circuitBreakerStates: Object.fromEntries(this.circuitBreakerStates),
            strategies: Object.fromEntries(this.recoveryStrategies)
        };
    }

    /**
     * Resets all recovery state
     */
    reset() {
        this.failureCounts.clear();
        this.circuitBreakerStates.clear();
        console.log('[Database Recovery] Recovery state reset');
    }
}

// Create singleton instance
const databaseRecovery = new DatabaseRecovery();

module.exports = databaseRecovery;
