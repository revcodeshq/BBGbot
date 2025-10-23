/**
 * Enhanced Error Handling System
 * Provides specific error types and recovery strategies
 */

class BotError extends Error {
    constructor(message, code, statusCode = 500) {
        super(message);
        this.name = 'BotError';
        this.code = code;
        this.statusCode = statusCode;
        this.timestamp = new Date().toISOString();
    }
}

class ValidationError extends BotError {
    constructor(message, field = null) {
        super(message, 'VALIDATION_ERROR', 400);
        this.name = 'ValidationError';
        this.field = field;
    }
}

class APIError extends BotError {
    constructor(message, service, originalError = null) {
        super(message, 'API_ERROR', 502);
        this.name = 'APIError';
        this.service = service;
        this.originalError = originalError;
    }
}

class RateLimitError extends BotError {
    constructor(message, retryAfter = null) {
        super(message, 'RATE_LIMIT_ERROR', 429);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }
}

class PermissionError extends BotError {
    constructor(message, requiredPermission = null) {
        super(message, 'PERMISSION_ERROR', 403);
        this.name = 'PermissionError';
        this.requiredPermission = requiredPermission;
    }
}

class DatabaseError extends BotError {
    constructor(message, operation = null, originalError = null) {
        super(message, 'DATABASE_ERROR', 500);
        this.name = 'DatabaseError';
        this.operation = operation;
        this.originalError = originalError;
    }
}

/**
 * Error Handler Class
 * Provides centralized error handling and recovery strategies
 */
class ErrorHandler {
    /**
     * Handles errors and provides appropriate responses
     * @param {Error} error - Error to handle
     * @param {Object} context - Context information (interaction, user, etc.)
     * @returns {Object} Error response object
     */
    static handleError(error, context = {}) {
        console.error(`[ErrorHandler] ${error.name}:`, error.message);
        console.error('Stack:', error.stack);

        // Log error details
        this.logError(error, context);

        // Determine user-friendly message
        const userMessage = this.getUserFriendlyMessage(error);
        
        // Determine if error should be reported to user
        const shouldReport = this.shouldReportToUser(error);

        return {
            userMessage: shouldReport ? userMessage : 'An unexpected error occurred. Please try again later.',
            shouldRetry: this.shouldRetry(error),
            retryAfter: error.retryAfter || null,
            errorCode: error.code || 'UNKNOWN_ERROR',
            timestamp: error.timestamp || new Date().toISOString()
        };
    }

    /**
     * Gets user-friendly error message
     * @param {Error} error - Error object
     * @returns {string} User-friendly message
     */
    static getUserFriendlyMessage(error) {
        switch (error.constructor.name) {
            case 'ValidationError':
                return `❌ ${error.message}`;
            
            case 'APIError':
                if (error.service === 'WOS_API') {
                    return '❌ Game API is currently unavailable. Please try again later.';
                }
                if (error.service === 'GEMINI_API') {
                    return '❌ Translation service is temporarily unavailable.';
                }
                return '❌ External service error. Please try again later.';
            
            case 'RateLimitError':
                return `⏳ Rate limited. Please wait ${error.retryAfter || 'a moment'} before trying again.`;
            
            case 'PermissionError':
                return `❌ You don't have permission to perform this action. ${error.requiredPermission ? `Required: ${error.requiredPermission}` : ''}`;
            
            case 'DatabaseError':
                return '❌ Database error occurred. Please try again later.';
            
            default:
                return '❌ An unexpected error occurred. Please try again later.';
        }
    }

    /**
     * Determines if error should be reported to user
     * @param {Error} error - Error object
     * @returns {boolean} True if should report to user
     */
    static shouldReportToUser(error) {
        // Don't report internal errors to users
        if (error instanceof DatabaseError && error.operation === 'internal') {
            return false;
        }
        
        // Don't report certain API errors
        if (error instanceof APIError && error.service === 'INTERNAL') {
            return false;
        }

        return true;
    }

    /**
     * Determines if operation should be retried
     * @param {Error} error - Error object
     * @returns {boolean} True if should retry
     */
    static shouldRetry(error) {
        if (error instanceof RateLimitError) {
            return true;
        }
        
        if (error instanceof APIError) {
            // Retry for temporary API issues
            return error.statusCode >= 500;
        }
        
        if (error instanceof DatabaseError) {
            // Retry for connection issues
            return error.originalError?.code === 'ECONNREFUSED';
        }

        return false;
    }

    /**
     * Logs error with context
     * @param {Error} error - Error object
     * @param {Object} context - Context information
     */
    static logError(error, context) {
        const errorLog = {
            name: error.name,
            message: error.message,
            code: error.code,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            context: {
                userId: context.user?.id,
                guildId: context.guild?.id,
                channelId: context.channel?.id,
                command: context.command,
                interactionType: context.interactionType
            }
        };

        // Log to console (in production, this would go to a logging service)
        console.error('[ErrorLog]', JSON.stringify(errorLog, null, 2));
    }

    /**
     * Creates a retry mechanism with exponential backoff
     * @param {Function} fn - Function to retry
     * @param {number} maxRetries - Maximum number of retries
     * @param {number} baseDelay - Base delay in milliseconds
     * @returns {Promise} Result of function execution
     */
    static async withRetry(fn, maxRetries = 3, baseDelay = 1000) {
        let lastError;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                
                if (attempt === maxRetries || !this.shouldRetry(error)) {
                    throw error;
                }
                
                // Exponential backoff
                const delay = baseDelay * Math.pow(2, attempt);
                console.log(`[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    }

    /**
     * Wraps async functions with error handling
     * @param {Function} fn - Async function to wrap
     * @param {Object} context - Context for error handling
     * @returns {Function} Wrapped function
     */
    static wrapAsync(fn, context = {}) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                const errorResponse = this.handleError(error, context);
                
                // If we have an interaction context, reply with error
                if (context.interaction && !context.interaction.replied) {
                    await context.interaction.reply({
                        content: errorResponse.userMessage,
                        flags: 64 // Ephemeral
                    });
                }
                
                throw error;
            }
        };
    }
}

/**
 * Error recovery strategies
 */
const RecoveryStrategies = {
    /**
     * Handles API rate limiting
     * @param {RateLimitError} error - Rate limit error
     * @returns {Promise} Recovery action
     */
    async handleRateLimit(error) {
        const delay = error.retryAfter || 60000; // Default 1 minute
        console.log(`[Recovery] Rate limited, waiting ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
    },

    /**
     * Handles API service unavailability
     * @param {APIError} error - API error
     * @returns {Promise} Recovery action
     */
    async handleAPIServiceDown(error) {
        console.log(`[Recovery] API service ${error.service} is down, implementing circuit breaker`);
        // In a real implementation, you'd implement circuit breaker pattern here
        await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds
    },

    /**
     * Handles database connection issues
     * @param {DatabaseError} error - Database error
     * @returns {Promise} Recovery action
     */
    async handleDatabaseConnection(error) {
        console.log('[Recovery] Database connection issue, attempting reconnection');
        // In a real implementation, you'd attempt to reconnect to database
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }
};

module.exports = {
    BotError,
    ValidationError,
    APIError,
    RateLimitError,
    PermissionError,
    DatabaseError,
    ErrorHandler,
    RecoveryStrategies
};
