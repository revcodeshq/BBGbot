/**
 * Database Monitoring System
 * Monitors database health and provides alerts for connection issues
 */

const { productionLogger } = require('./production-logger');
const mongodbManager = require('./mongodb-manager');
const databaseRecovery = require('./database-recovery');

class DatabaseMonitor {
    constructor() {
        this.monitoringInterval = null;
        this.alertThresholds = {
            connectionFailures: 3,
            responseTime: 5000, // 5 seconds
            memoryUsage: 80, // 80%
            errorRate: 0.1 // 10%
        };
        this.metrics = {
            totalOperations: 0,
            successfulOperations: 0,
            failedOperations: 0,
            averageResponseTime: 0,
            lastHealthCheck: null,
            connectionState: 'unknown'
        };
        this.alerts = new Map();
        this.startMonitoring();
    }

    /**
     * Starts continuous database monitoring
     */
    startMonitoring() {
        // Run health checks every 30 seconds
        this.monitoringInterval = setInterval(async () => {
            await this.performHealthCheck();
        }, 30000);

        // Initial health check
        setTimeout(() => {
            this.performHealthCheck();
        }, 5000);

        console.log('[Database Monitor] Monitoring started');
    }

    /**
     * Stops database monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        console.log('[Database Monitor] Monitoring stopped');
    }

    /**
     * Performs a comprehensive health check
     */
    async performHealthCheck() {
        const startTime = Date.now();
        
        try {
            const isHealthy = await mongodbManager.isHealthy();
            const status = mongodbManager.getStatus();
            const recoveryStats = databaseRecovery.getRecoveryStats();
            
            this.metrics.lastHealthCheck = new Date();
            this.metrics.connectionState = status.state;
            
            const healthData = {
                timestamp: this.metrics.lastHealthCheck,
                healthy: isHealthy,
                connectionState: status.state,
                readyState: status.readyState,
                reconnectAttempts: status.reconnectAttempts,
                responseTime: Date.now() - startTime,
                failureCounts: recoveryStats.failureCounts,
                circuitBreakerStates: recoveryStats.circuitBreakerStates
            };

            // Check for alerts
            await this.checkAlerts(healthData);
            
            // Log health status
            this.logHealthStatus(healthData);
            
        } catch (error) {
            console.error('[Database Monitor] Health check failed:', error.message);
            productionLogger.error('Database health check failed', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Checks for alert conditions
     * @param {Object} healthData - Health check data
     */
    async checkAlerts(healthData) {
        const alerts = [];

        // Connection state alerts
        if (healthData.connectionState === 'disconnected' || healthData.connectionState === 'error') {
            alerts.push({
                type: 'connection',
                severity: 'critical',
                message: `Database connection is ${healthData.connectionState}`,
                data: healthData
            });
        }

        // High reconnect attempts
        if (healthData.reconnectAttempts > this.alertThresholds.connectionFailures) {
            alerts.push({
                type: 'reconnection',
                severity: 'warning',
                message: `High number of reconnection attempts: ${healthData.reconnectAttempts}`,
                data: healthData
            });
        }

        // Slow response time
        if (healthData.responseTime > this.alertThresholds.responseTime) {
            alerts.push({
                type: 'performance',
                severity: 'warning',
                message: `Slow database response time: ${healthData.responseTime}ms`,
                data: healthData
            });
        }

        // Circuit breaker alerts
        Object.entries(healthData.circuitBreakerStates).forEach(([operation, state]) => {
            if (state.open) {
                alerts.push({
                    type: 'circuit_breaker',
                    severity: 'critical',
                    message: `Circuit breaker open for operation: ${operation}`,
                    data: { operation, state }
                });
            }
        });

        // Process alerts
        for (const alert of alerts) {
            await this.processAlert(alert);
        }
    }

    /**
     * Processes an alert
     * @param {Object} alert - Alert to process
     */
    async processAlert(alert) {
        const alertKey = `${alert.type}_${alert.severity}`;
        const lastAlert = this.alerts.get(alertKey);
        const now = Date.now();
        
        // Prevent spam - only alert once per minute for the same issue
        if (lastAlert && (now - lastAlert.timestamp) < 60000) {
            return;
        }

        // Store alert
        this.alerts.set(alertKey, {
            ...alert,
            timestamp: now,
            count: (lastAlert?.count || 0) + 1
        });

        // Log alert
        const logLevel = alert.severity === 'critical' ? 'error' : 'warn';
        productionLogger[logLevel](`Database Alert: ${alert.message}`, {
            type: alert.type,
            severity: alert.severity,
            data: alert.data
        });

        console.log(`[Database Monitor] ${alert.severity.toUpperCase()}: ${alert.message}`);
    }

    /**
     * Logs health status
     * @param {Object} healthData - Health check data
     */
    logHealthStatus(healthData) {
        const statusEmoji = healthData.healthy ? '✅' : '❌';
        const stateEmoji = {
            connected: '🟢',
            disconnected: '🔴',
            error: '🔴',
            connecting: '🟡'
        };

        console.log(`[Database Monitor] ${statusEmoji} Health: ${healthData.healthy ? 'HEALTHY' : 'UNHEALTHY'} | State: ${stateEmoji[healthData.connectionState] || '❓'} ${healthData.connectionState.toUpperCase()} | Response: ${healthData.responseTime}ms`);
    }

    /**
     * Records operation metrics
     * @param {string} operation - Operation name
     * @param {boolean} success - Whether operation succeeded
     * @param {number} duration - Operation duration in ms
     */
    recordOperation(operation, success, duration) {
        this.metrics.totalOperations++;
        
        if (success) {
            this.metrics.successfulOperations++;
        } else {
            this.metrics.failedOperations++;
        }

        // Update average response time
        const totalTime = this.metrics.averageResponseTime * (this.metrics.totalOperations - 1) + duration;
        this.metrics.averageResponseTime = totalTime / this.metrics.totalOperations;
    }

    /**
     * Gets current metrics
     * @returns {Object} Current metrics
     */
    getMetrics() {
        const successRate = this.metrics.totalOperations > 0 
            ? (this.metrics.successfulOperations / this.metrics.totalOperations) * 100 
            : 0;

        return {
            ...this.metrics,
            successRate: Math.round(successRate * 100) / 100,
            errorRate: Math.round((1 - successRate / 100) * 100) / 100
        };
    }

    /**
     * Gets recent alerts
     * @param {number} minutes - Number of minutes to look back
     * @returns {Array} Recent alerts
     */
    getRecentAlerts(minutes = 60) {
        const cutoff = Date.now() - (minutes * 60 * 1000);
        return Array.from(this.alerts.values())
            .filter(alert => alert.timestamp > cutoff)
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Clears old alerts
     * @param {number} hours - Hours of alerts to keep
     */
    clearOldAlerts(hours = 24) {
        const cutoff = Date.now() - (hours * 60 * 60 * 1000);
        for (const [key, alert] of this.alerts.entries()) {
            if (alert.timestamp < cutoff) {
                this.alerts.delete(key);
            }
        }
    }

    /**
     * Gets monitoring status
     * @returns {Object} Monitoring status
     */
    getStatus() {
        return {
            monitoring: this.monitoringInterval !== null,
            metrics: this.getMetrics(),
            recentAlerts: this.getRecentAlerts(60),
            alertThresholds: this.alertThresholds
        };
    }
}

// Create singleton instance
const databaseMonitor = new DatabaseMonitor();

module.exports = databaseMonitor;
