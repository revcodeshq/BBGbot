/**
 * MongoDB Connection Manager
 * Handles robust MongoDB connections with automatic reconnection and error recovery
 */

const mongoose = require('mongoose');
const { productionLogger } = require('./production-logger');

class MongoDBManager {
    constructor() {
        this.connectionState = 'disconnected';
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000; // 5 seconds
        this.maxReconnectDelay = 60000; // 1 minute
        this.mongoUri = null; // Store the URI for reconnection
        this.connectionOptions = {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            connectTimeoutMS: 10000,
            bufferCommands: true, // Enable buffering to allow operations before connection
            // Heartbeat settings
            heartbeatFrequencyMS: 10000
        };
        this.connectionListeners = new Set();
        this.isConnecting = false;
        this.lastConnectionAttempt = null;
        this.operationMetrics = {
            total: 0,
            successful: 0,
            failed: 0,
            averageResponseTime: 0
        };
    }

    /**
     * Connects to MongoDB with robust error handling
     * @param {string} mongoUri - MongoDB connection URI
     * @returns {Promise<boolean>} Connection success status
     */
    async connect(mongoUri) {
        if (!mongoUri) {
            console.error('[MongoDB] No MongoDB URI provided');
            this.connectionState = 'error';
            return false;
        }

        // Store URI for reconnection
        this.mongoUri = mongoUri;

        if (this.isConnecting) {
            console.log('[MongoDB] Connection already in progress, waiting...');
            return this.waitForConnection();
        }

        this.isConnecting = true;
        this.lastConnectionAttempt = new Date();

        try {
            console.log('[MongoDB] Attempting to connect...');
            
            // Set up connection event listeners
            this.setupConnectionListeners();
            
            await mongoose.connect(mongoUri, this.connectionOptions);
            
            this.connectionState = 'connected';
            this.reconnectAttempts = 0;
            this.isConnecting = false;
            
            console.log('[MongoDB] Successfully connected to MongoDB');
            if (productionLogger && productionLogger.info) {
                productionLogger.info('MongoDB connection established', {
                    host: mongoose.connection.host,
                    port: mongoose.connection.port,
                    name: mongoose.connection.name
                });
            }
            
            return true;
            
        } catch (error) {
            this.isConnecting = false;
            this.connectionState = 'error';
            
            console.error('[MongoDB] Connection failed:', error.message);
            if (productionLogger && productionLogger.error) {
                productionLogger.error('MongoDB connection failed', {
                    error: error.message,
                    stack: error.stack,
                    attempt: this.reconnectAttempts + 1
                });
            }
            
            // Don't throw error, let the reconnection logic handle it
            return false;
        }
    }

    /**
     * Sets up MongoDB connection event listeners
     */
    setupConnectionListeners() {
        // Connection established
        mongoose.connection.on('connected', () => {
            this.connectionState = 'connected';
            this.reconnectAttempts = 0;
            console.log('[MongoDB] Connection established');
            this.notifyListeners('connected');
        });

        // Connection error
        mongoose.connection.on('error', (error) => {
            this.connectionState = 'error';
            console.error('[MongoDB] Connection error:', error.message);
            if (productionLogger && productionLogger.error) {
                productionLogger.error('MongoDB connection error', {
                    error: error.message,
                    stack: error.stack
                });
            }
            this.notifyListeners('error', error);
        });

        // Connection disconnected
        mongoose.connection.on('disconnected', () => {
            this.connectionState = 'disconnected';
            console.warn('[MongoDB] Connection disconnected');
            if (productionLogger && productionLogger.warn) {
                productionLogger.warn('MongoDB connection disconnected');
            }
            this.notifyListeners('disconnected');
            
            // Attempt reconnection if not manually disconnected
            if (!this.isManuallyDisconnected) {
                this.scheduleReconnection();
            }
        });

        // Connection reconnected
        mongoose.connection.on('reconnected', () => {
            this.connectionState = 'connected';
            this.reconnectAttempts = 0;
            console.log('[MongoDB] Reconnected successfully');
            if (productionLogger && productionLogger.info) {
                productionLogger.info('MongoDB reconnected successfully');
            }
            this.notifyListeners('reconnected');
        });

        // Connection closed
        mongoose.connection.on('close', () => {
            this.connectionState = 'closed';
            console.log('[MongoDB] Connection closed');
            this.notifyListeners('closed');
        });
    }

    /**
     * Schedules automatic reconnection with exponential backoff
     */
    scheduleReconnection() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('[MongoDB] Max reconnection attempts reached, giving up');
            productionLogger.error('MongoDB max reconnection attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = Math.min(
            this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            this.maxReconnectDelay
        );

        console.log(`[MongoDB] Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`);
        
        setTimeout(async () => {
            if (this.connectionState === 'disconnected' || this.connectionState === 'error') {
                await this.attemptReconnection();
            }
        }, delay);
    }

    /**
     * Attempts to reconnect to MongoDB
     */
    async attemptReconnection() {
        if (this.isConnecting) {
            return;
        }

        try {
            console.log(`[MongoDB] Attempting reconnection (attempt ${this.reconnectAttempts})`);
            
            // Use stored URI for reconnection
            if (this.mongoUri) {
                await mongoose.connect(this.mongoUri, this.connectionOptions);
            } else {
                console.warn('[MongoDB] Cannot reconnect - no URI available');
                return;
            }
            
        } catch (error) {
            console.error('[MongoDB] Reconnection failed:', error.message);
            if (productionLogger && productionLogger.error) {
                productionLogger.error('MongoDB reconnection failed', {
                    error: error.message,
                    attempt: this.reconnectAttempts
                });
            }
            
            // Schedule another reconnection attempt
            this.scheduleReconnection();
        }
    }

    /**
     * Waits for connection to be established
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise<boolean>} Connection success status
     */
    async waitForConnection(timeout = 30000) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            
            const checkConnection = () => {
                if (this.connectionState === 'connected') {
                    resolve(true);
                    return;
                }
                
                if (Date.now() - startTime > timeout) {
                    resolve(false);
                    return;
                }
                
                setTimeout(checkConnection, 100);
            };
            
            checkConnection();
        });
    }

    /**
     * Checks if MongoDB is connected and healthy
     * @returns {Promise<boolean>} Connection health status
     */
    async isHealthy() {
        try {
            if (mongoose.connection.readyState !== 1) {
                return false;
            }
            
            // Test with a simple ping
            await mongoose.connection.db.admin().ping();
            return true;
            
        } catch (error) {
            console.warn('[MongoDB] Health check failed:', error.message);
            return false;
        }
    }

    /**
     * Executes a database operation with automatic retry on connection failure
     * @param {Function} operation - Database operation to execute
     * @param {number} maxRetries - Maximum number of retries
     * @param {string} operationName - Name of the operation for metrics
     * @returns {Promise<any>} Operation result
     */
    async executeWithRetry(operation, maxRetries = 3, operationName = 'unknown') {
        const startTime = Date.now();
        let lastError;
        
        this.operationMetrics.total++;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Check connection health before operation
                if (!await this.isHealthy()) {
                    throw new Error('Database connection not healthy');
                }
                
                const result = await operation();
                
                // Record successful operation
                this.operationMetrics.successful++;
                this.updateAverageResponseTime(Date.now() - startTime);
                
                return result;
                
            } catch (error) {
                lastError = error;
                
                // Check if it's a connection-related error
                if (this.isConnectionError(error)) {
                    console.warn(`[MongoDB] Connection error on attempt ${attempt}/${maxRetries}:`, error.message);
                    
                    if (attempt < maxRetries) {
                        // Wait before retry with exponential backoff
                        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        
                        // Attempt reconnection if needed
                        if (mongoose.connection.readyState !== 1) {
                            await this.attemptReconnection();
                        }
                    }
                } else {
                    // Non-connection error, don't retry
                    this.operationMetrics.failed++;
                    this.updateAverageResponseTime(Date.now() - startTime);
                    throw error;
                }
            }
        }
        
        // All retries failed
        this.operationMetrics.failed++;
        this.updateAverageResponseTime(Date.now() - startTime);
        throw lastError;
    }

    /**
     * Updates average response time
     * @param {number} responseTime - Response time in milliseconds
     */
    updateAverageResponseTime(responseTime) {
        const totalTime = this.operationMetrics.averageResponseTime * (this.operationMetrics.total - 1) + responseTime;
        this.operationMetrics.averageResponseTime = totalTime / this.operationMetrics.total;
    }

    /**
     * Determines if an error is connection-related
     * @param {Error} error - Error to check
     * @returns {boolean} True if connection-related
     */
    isConnectionError(error) {
        const connectionErrorMessages = [
            'connection',
            'closed',
            'timeout',
            'ECONNREFUSED',
            'ENOTFOUND',
            'ETIMEDOUT',
            'server selection',
            'topology'
        ];
        
        const errorMessage = error.message.toLowerCase();
        return connectionErrorMessages.some(msg => errorMessage.includes(msg));
    }

    /**
     * Adds a connection state listener
     * @param {Function} listener - Listener function
     */
    addConnectionListener(listener) {
        this.connectionListeners.add(listener);
    }

    /**
     * Removes a connection state listener
     * @param {Function} listener - Listener function
     */
    removeConnectionListener(listener) {
        this.connectionListeners.delete(listener);
    }

    /**
     * Notifies all listeners of connection state changes
     * @param {string} event - Event type
     * @param {any} data - Event data
     */
    notifyListeners(event, data = null) {
        this.connectionListeners.forEach(listener => {
            try {
                listener(event, data);
            } catch (error) {
                console.error('[MongoDB] Error in connection listener:', error);
            }
        });
    }

    /**
     * Gets current connection status
     * @returns {Object} Connection status information
     */
    getStatus() {
        const successRate = this.operationMetrics.total > 0 
            ? (this.operationMetrics.successful / this.operationMetrics.total) * 100 
            : 0;

        return {
            state: this.connectionState,
            readyState: mongoose.connection.readyState,
            reconnectAttempts: this.reconnectAttempts,
            isConnecting: this.isConnecting,
            lastAttempt: this.lastConnectionAttempt,
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            name: mongoose.connection.name,
            metrics: {
                ...this.operationMetrics,
                successRate: Math.round(successRate * 100) / 100,
                errorRate: Math.round((1 - successRate / 100) * 100) / 100
            }
        };
    }

    /**
     * Gracefully closes the MongoDB connection
     */
    async disconnect() {
        this.isManuallyDisconnected = true;
        
        try {
            if (mongoose.connection.readyState === 1) {
                await mongoose.connection.close();
                console.log('[MongoDB] Connection closed gracefully');
            }
        } catch (error) {
            console.error('[MongoDB] Error closing connection:', error.message);
        }
        
        this.connectionState = 'disconnected';
    }
}

// Create singleton instance
const mongodbManager = new MongoDBManager();

module.exports = mongodbManager;
