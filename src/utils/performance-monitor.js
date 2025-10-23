/**
 * Advanced Performance Monitoring System
 * Provides real-time performance tracking, alerts, and optimization suggestions
 */

const { EmbedBuilder } = require('discord.js');

class PerformanceMonitor {
    constructor() {
        this.metrics = {
            responseTimes: new Map(),
            memoryUsage: [],
            cpuUsage: [],
            apiCalls: new Map(),
            errors: new Map(),
            alerts: []
        };
        
        this.thresholds = {
            memoryWarning: 200 * 1024 * 1024, // 200MB
            memoryCritical: 400 * 1024 * 1024, // 400MB
            responseTimeWarning: 2000, // 2 seconds
            responseTimeCritical: 5000, // 5 seconds
            errorRateWarning: 5, // 5%
            errorRateCritical: 10 // 10%
        };
        
        this.startMonitoring();
    }

    /**
     * Starts continuous performance monitoring
     */
    startMonitoring() {
        // Monitor memory usage every 30 seconds
        setInterval(() => {
            this.trackMemoryUsage();
        }, 30000);

        // Monitor CPU usage every minute
        setInterval(() => {
            this.trackCpuUsage();
        }, 60000);

        // Check for alerts every 2 minutes
        setInterval(() => {
            this.checkAlerts();
        }, 120000);

        // Cleanup old data every 5 minutes
        setInterval(() => {
            this.cleanupOldData();
        }, 300000);
    }

    /**
     * Tracks command response time
     * @param {string} commandName - Name of the command
     * @param {number} responseTime - Response time in milliseconds
     */
    trackResponseTime(commandName, responseTime) {
        if (!this.metrics.responseTimes.has(commandName)) {
            this.metrics.responseTimes.set(commandName, []);
        }
        
        const times = this.metrics.responseTimes.get(commandName);
        times.push(responseTime);
        
        // Keep only last 100 measurements
        if (times.length > 100) {
            times.shift();
        }
    }

    /**
     * Tracks memory usage
     */
    trackMemoryUsage() {
        const memUsage = process.memoryUsage();
        this.metrics.memoryUsage.push({
            timestamp: Date.now(),
            heapUsed: memUsage.heapUsed,
            heapTotal: memUsage.heapTotal,
            external: memUsage.external,
            rss: memUsage.rss
        });

        // Keep only last 100 measurements
        if (this.metrics.memoryUsage.length > 100) {
            this.metrics.memoryUsage.shift();
        }

        // Check for memory alerts
        if (memUsage.heapUsed > this.thresholds.memoryCritical) {
            this.addAlert('critical', 'memory', `Memory usage critical: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
        } else if (memUsage.heapUsed > this.thresholds.memoryWarning) {
            this.addAlert('warning', 'memory', `Memory usage high: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
        }
    }

    /**
     * Tracks CPU usage
     */
    trackCpuUsage() {
        const cpuUsage = process.cpuUsage();
        this.metrics.cpuUsage.push({
            timestamp: Date.now(),
            user: cpuUsage.user,
            system: cpuUsage.system
        });

        // Keep only last 50 measurements
        if (this.metrics.cpuUsage.length > 50) {
            this.metrics.cpuUsage.shift();
        }
    }

    /**
     * Tracks API call performance
     * @param {string} apiName - Name of the API
     * @param {number} responseTime - Response time in milliseconds
     * @param {boolean} success - Whether the call was successful
     */
    trackApiCall(apiName, responseTime, success = true) {
        if (!this.metrics.apiCalls.has(apiName)) {
            this.metrics.apiCalls.set(apiName, {
                calls: [],
                successCount: 0,
                failureCount: 0
            });
        }

        const apiData = this.metrics.apiCalls.get(apiName);
        apiData.calls.push({ timestamp: Date.now(), responseTime, success });
        
        if (success) {
            apiData.successCount++;
        } else {
            apiData.failureCount++;
        }

        // Keep only last 200 calls
        if (apiData.calls.length > 200) {
            apiData.calls.shift();
        }
    }

    /**
     * Tracks errors
     * @param {string} errorType - Type of error
     * @param {string} context - Context where error occurred
     */
    trackError(errorType, context) {
        const key = `${errorType}:${context}`;
        if (!this.metrics.errors.has(key)) {
            this.metrics.errors.set(key, 0);
        }
        this.metrics.errors.set(key, this.metrics.errors.get(key) + 1);
    }

    /**
     * Adds an alert
     * @param {string} level - Alert level (warning, critical)
     * @param {string} type - Alert type
     * @param {string} message - Alert message
     */
    addAlert(level, type, message) {
        this.metrics.alerts.push({
            timestamp: Date.now(),
            level,
            type,
            message
        });

        // Keep only last 50 alerts
        if (this.metrics.alerts.length > 50) {
            this.metrics.alerts.shift();
        }

        console.log(`[Performance Alert] ${level.toUpperCase()}: ${message}`);
    }

    /**
     * Checks for performance alerts
     */
    checkAlerts() {
        // Check response times
        for (const [commandName, times] of this.metrics.responseTimes.entries()) {
            if (times.length >= 10) {
                const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
                if (avgTime > this.thresholds.responseTimeCritical) {
                    this.addAlert('critical', 'response_time', `Command ${commandName} average response time critical: ${Math.round(avgTime)}ms`);
                } else if (avgTime > this.thresholds.responseTimeWarning) {
                    this.addAlert('warning', 'response_time', `Command ${commandName} average response time high: ${Math.round(avgTime)}ms`);
                }
            }
        }

        // Check error rates
        const totalErrors = Array.from(this.metrics.errors.values()).reduce((a, b) => a + b, 0);
        const totalCommands = Array.from(this.metrics.responseTimes.values()).reduce((a, b) => a + b.length, 0);
        
        if (totalCommands > 0) {
            const errorRate = (totalErrors / totalCommands) * 100;
            if (errorRate > this.thresholds.errorRateCritical) {
                this.addAlert('critical', 'error_rate', `Error rate critical: ${errorRate.toFixed(1)}%`);
            } else if (errorRate > this.thresholds.errorRateWarning) {
                this.addAlert('warning', 'error_rate', `Error rate high: ${errorRate.toFixed(1)}%`);
            }
        }
    }

    /**
     * Cleans up old data
     */
    cleanupOldData() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        // Clean up old memory usage data
        this.metrics.memoryUsage = this.metrics.memoryUsage.filter(
            data => now - data.timestamp < maxAge
        );

        // Clean up old CPU usage data
        this.metrics.cpuUsage = this.metrics.cpuUsage.filter(
            data => now - data.timestamp < maxAge
        );

        // Clean up old alerts
        this.metrics.alerts = this.metrics.alerts.filter(
            alert => now - alert.timestamp < maxAge
        );
    }

    /**
     * Gets performance statistics
     * @returns {Object} Performance statistics
     */
    getPerformanceStats() {
        const stats = {
            memory: this.getMemoryStats(),
            cpu: this.getCpuStats(),
            responseTimes: this.getResponseTimeStats(),
            apiCalls: this.getApiCallStats(),
            errors: this.getErrorStats(),
            alerts: this.getRecentAlerts()
        };

        return stats;
    }

    /**
     * Gets memory statistics
     * @returns {Object} Memory statistics
     */
    getMemoryStats() {
        if (this.metrics.memoryUsage.length === 0) {
            return { current: 0, average: 0, peak: 0, trend: 'stable' };
        }

        const current = this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1];
        const average = this.metrics.memoryUsage.reduce((a, b) => a + b.heapUsed, 0) / this.metrics.memoryUsage.length;
        const peak = Math.max(...this.metrics.memoryUsage.map(m => m.heapUsed));

        // Calculate trend
        const recent = this.metrics.memoryUsage.slice(-10);
        const older = this.metrics.memoryUsage.slice(-20, -10);
        
        let trend = 'stable';
        if (recent.length >= 5 && older.length >= 5) {
            const recentAvg = recent.reduce((a, b) => a + b.heapUsed, 0) / recent.length;
            const olderAvg = older.reduce((a, b) => a + b.heapUsed, 0) / older.length;
            
            if (recentAvg > olderAvg * 1.1) trend = 'increasing';
            else if (recentAvg < olderAvg * 0.9) trend = 'decreasing';
        }

        return {
            current: Math.round(current.heapUsed / 1024 / 1024),
            average: Math.round(average / 1024 / 1024),
            peak: Math.round(peak / 1024 / 1024),
            trend
        };
    }

    /**
     * Gets CPU statistics
     * @returns {Object} CPU statistics
     */
    getCpuStats() {
        if (this.metrics.cpuUsage.length === 0) {
            return { current: 0, average: 0 };
        }

        const current = this.metrics.cpuUsage[this.metrics.cpuUsage.length - 1];
        const average = this.metrics.cpuUsage.reduce((a, b) => a + b.user + b.system, 0) / this.metrics.cpuUsage.length;

        return {
            current: Math.round((current.user + current.system) / 1000),
            average: Math.round(average / 1000)
        };
    }

    /**
     * Gets response time statistics
     * @returns {Object} Response time statistics
     */
    getResponseTimeStats() {
        const stats = {};
        
        for (const [commandName, times] of this.metrics.responseTimes.entries()) {
            if (times.length > 0) {
                const avg = times.reduce((a, b) => a + b, 0) / times.length;
                const min = Math.min(...times);
                const max = Math.max(...times);
                
                stats[commandName] = {
                    average: Math.round(avg),
                    min,
                    max,
                    count: times.length
                };
            }
        }

        return stats;
    }

    /**
     * Gets API call statistics
     * @returns {Object} API call statistics
     */
    getApiCallStats() {
        const stats = {};
        
        for (const [apiName, data] of this.metrics.apiCalls.entries()) {
            if (data.calls.length > 0) {
                const avgTime = data.calls.reduce((a, b) => a + b.responseTime, 0) / data.calls.length;
                const successRate = (data.successCount / (data.successCount + data.failureCount)) * 100;
                
                stats[apiName] = {
                    averageTime: Math.round(avgTime),
                    successRate: Math.round(successRate),
                    totalCalls: data.calls.length,
                    successCount: data.successCount,
                    failureCount: data.failureCount
                };
            }
        }

        return stats;
    }

    /**
     * Gets error statistics
     * @returns {Object} Error statistics
     */
    getErrorStats() {
        const stats = {};
        
        for (const [errorKey, count] of this.metrics.errors.entries()) {
            const [errorType, context] = errorKey.split(':');
            if (!stats[errorType]) {
                stats[errorType] = {};
            }
            stats[errorType][context] = count;
        }

        return stats;
    }

    /**
     * Gets recent alerts
     * @param {number} limit - Number of recent alerts to return
     * @returns {Array} Recent alerts
     */
    getRecentAlerts(limit = 10) {
        return this.metrics.alerts
            .slice(-limit)
            .reverse()
            .map(alert => ({
                ...alert,
                timestamp: new Date(alert.timestamp).toISOString()
            }));
    }

    /**
     * Creates a performance dashboard embed
     * @param {Client} client - Discord client
     * @returns {EmbedBuilder} Performance dashboard embed
     */
    createPerformanceDashboard(client) {
        const stats = this.getPerformanceStats();
        const memStats = stats.memory;
        const cpuStats = stats.cpu;
        const responseStats = stats.responseTimes;
        const apiStats = stats.apiCalls;
        const recentAlerts = stats.alerts.slice(0, 5);

        const embed = new EmbedBuilder()
            .setTitle('🚀 Advanced Performance Dashboard')
            .setColor(0x00ff00)
            .setTimestamp()
            .setFooter({ text: `Bot ID: ${client.user.id}` })
            .addFields(
                {
                    name: '💾 Memory Usage',
                    value: `Current: ${memStats.current}MB\nAverage: ${memStats.average}MB\nPeak: ${memStats.peak}MB\nTrend: ${memStats.trend}`,
                    inline: true
                },
                {
                    name: '⚡ CPU Usage',
                    value: `Current: ${cpuStats.current}ms\nAverage: ${cpuStats.average}ms`,
                    inline: true
                },
                {
                    name: '📊 System Health',
                    value: `Uptime: ${Math.floor(client.uptime / 1000)}s\nGuilds: ${client.guilds.cache.size}\nUsers: ${client.users.cache.size}`,
                    inline: true
                }
            );

        // Add response time stats
        if (Object.keys(responseStats).length > 0) {
            const responseText = Object.entries(responseStats)
                .slice(0, 5)
                .map(([cmd, stat]) => `\`${cmd}\`: ${stat.average}ms avg`)
                .join('\n');
            
            embed.addFields({
                name: '⏱️ Response Times',
                value: responseText || 'No data',
                inline: true
            });
        }

        // Add API stats
        if (Object.keys(apiStats).length > 0) {
            const apiText = Object.entries(apiStats)
                .slice(0, 3)
                .map(([api, stat]) => `\`${api}\`: ${stat.successRate}% success`)
                .join('\n');
            
            embed.addFields({
                name: '🌐 API Performance',
                value: apiText || 'No data',
                inline: true
            });
        }

        // Add recent alerts
        if (recentAlerts.length > 0) {
            const alertText = recentAlerts
                .map(alert => `${alert.level === 'critical' ? '🔴' : '🟡'} ${alert.message}`)
                .join('\n');
            
            embed.addFields({
                name: '🚨 Recent Alerts',
                value: alertText,
                inline: false
            });
        }

        return embed;
    }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = {
    PerformanceMonitor,
    performanceMonitor
};
