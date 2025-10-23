/**
 * Metrics and Monitoring System
 * Tracks bot performance, usage patterns, and system health
 */

const { EmbedBuilder } = require('discord.js');
const { get } = require('./config');

class MetricsCollector {
    constructor() {
        this.metrics = {
            commands: new Map(),
            errors: new Map(),
            apiCalls: new Map(),
            users: new Set(),
            guilds: new Set(),
            startTime: Date.now(),
            botReadyTime: null // Track when bot actually becomes ready
        };
        
        this.counters = {
            totalCommands: 0,
            totalErrors: 0,
            totalApiCalls: 0,
            totalMessages: 0,
            totalInteractions: 0
        };
    }

    /**
     * Sets the bot ready time when the client becomes ready
     * @param {number} readyTime - Timestamp when bot became ready
     */
    setBotReadyTime(readyTime = Date.now()) {
        this.metrics.botReadyTime = readyTime;
        console.log(`[Metrics] Bot ready time set to: ${new Date(readyTime).toISOString()}`);
    }

    /**
     * Tracks command usage
     * @param {string} commandName - Name of the command
     * @param {string} userId - User who executed the command
     * @param {number} executionTime - Time taken to execute in ms
     * @param {boolean} success - Whether command succeeded
     */
    trackCommand(commandName, userId, executionTime = 0, success = true) {
        this.counters.totalCommands++;
        
        if (!this.metrics.commands.has(commandName)) {
            this.metrics.commands.set(commandName, {
                count: 0,
                totalTime: 0,
                successCount: 0,
                errorCount: 0,
                users: new Set(),
                avgTime: 0
            });
        }
        
        const command = this.metrics.commands.get(commandName);
        command.count++;
        command.totalTime += executionTime;
        command.users.add(userId);
        command.avgTime = command.totalTime / command.count;
        
        if (success) {
            command.successCount++;
        } else {
            command.errorCount++;
        }
    }

    /**
     * Tracks error occurrences
     * @param {Error} error - Error object
     * @param {string} context - Context where error occurred
     */
    trackError(error, context = 'unknown') {
        this.counters.totalErrors++;
        
        const errorKey = `${error.name}:${context}`;
        if (!this.metrics.errors.has(errorKey)) {
            this.metrics.errors.set(errorKey, {
                count: 0,
                lastOccurrence: null,
                contexts: new Set()
            });
        }
        
        const errorMetric = this.metrics.errors.get(errorKey);
        errorMetric.count++;
        errorMetric.lastOccurrence = new Date();
        errorMetric.contexts.add(context);
    }

    /**
     * Tracks API calls
     * @param {string} service - API service name
     * @param {number} responseTime - Response time in ms
     * @param {boolean} success - Whether call succeeded
     */
    trackApiCall(service, responseTime = 0, success = true) {
        this.counters.totalApiCalls++;
        
        if (!this.metrics.apiCalls.has(service)) {
            this.metrics.apiCalls.set(service, {
                count: 0,
                totalTime: 0,
                successCount: 0,
                errorCount: 0,
                avgTime: 0
            });
        }
        
        const apiMetric = this.metrics.apiCalls.get(service);
        apiMetric.count++;
        apiMetric.totalTime += responseTime;
        apiMetric.avgTime = apiMetric.totalTime / apiMetric.count;
        
        if (success) {
            apiMetric.successCount++;
        } else {
            apiMetric.errorCount++;
        }
    }

    /**
     * Tracks user activity
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     */
    trackUser(userId, guildId) {
        this.metrics.users.add(userId);
        this.metrics.guilds.add(guildId);
    }

    /**
     * Increments message counter
     */
    trackMessage() {
        this.counters.totalMessages++;
    }

    /**
     * Increments interaction counter
     */
    trackInteraction() {
        this.counters.totalInteractions++;
    }

    /**
     * Gets uptime in human-readable format
     * @returns {string} Uptime string
     */
    getUptime() {
        const startTime = this.metrics.botReadyTime || this.metrics.startTime;
        const uptime = Date.now() - startTime;
        
        // Debug logging
        console.log(`[Metrics Debug] startTime: ${startTime}, currentTime: ${Date.now()}, uptime: ${uptime}ms`);
        
        // Handle very short uptimes (less than 1 minute)
        if (uptime < 60000) {
            const seconds = Math.floor(uptime / 1000);
            return `${seconds}s`;
        }
        
        const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
        const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        
        // Show seconds if less than 1 hour
        if (days === 0 && hours === 0) {
            const seconds = Math.floor((uptime % (1000 * 60)) / 1000);
            return `${minutes}m ${seconds}s`;
        }
        
        return `${days}d ${hours}h ${minutes}m`;
    }

    /**
     * Gets system health metrics
     * @returns {Object} Health metrics
     */
    getHealthMetrics() {
        const startTime = this.metrics.botReadyTime || this.metrics.startTime;
        const uptime = Date.now() - startTime;
        const uptimeHours = uptime / (1000 * 60 * 60);
        
        return {
            uptime: this.getUptime(),
            uptimeHours,
            commandsPerHour: uptimeHours > 0 ? this.counters.totalCommands / uptimeHours : 0,
            errorsPerHour: uptimeHours > 0 ? this.counters.totalErrors / uptimeHours : 0,
            errorRate: this.counters.totalCommands > 0 ? (this.counters.totalErrors / this.counters.totalCommands) * 100 : 0,
            uniqueUsers: this.metrics.users.size,
            uniqueGuilds: this.metrics.guilds.size,
            memoryUsage: process.memoryUsage(),
            cpuUsage: process.cpuUsage()
        };
    }

    /**
     * Gets top commands by usage
     * @param {number} limit - Number of top commands to return
     * @returns {Array} Top commands
     */
    getTopCommands(limit = 10) {
        return Array.from(this.metrics.commands.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, limit)
            .map(([name, data]) => ({
                name,
                count: data.count,
                avgTime: Math.round(data.avgTime),
                successRate: (data.successCount / data.count) * 100,
                uniqueUsers: data.users.size
            }));
    }

    /**
     * Gets error summary
     * @param {number} limit - Number of top errors to return
     * @returns {Array} Top errors
     */
    getErrorSummary(limit = 10) {
        return Array.from(this.metrics.errors.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, limit)
            .map(([errorKey, data]) => ({
                error: errorKey,
                count: data.count,
                lastOccurrence: data.lastOccurrence,
                contexts: Array.from(data.contexts)
            }));
    }

    /**
     * Creates a metrics embed for display
     * @param {Object} client - Discord client
     * @returns {EmbedBuilder} Metrics embed
     */
    createMetricsEmbed(client) {
        const health = this.getHealthMetrics();
        const topCommands = this.getTopCommands(5);
        const topErrors = this.getErrorSummary(3);
        
        // Get real Discord data
        const totalUsers = client.users.cache.size;
        const totalGuilds = client.guilds.cache.size;
        const totalChannels = client.channels.cache.size;
        
        // Calculate real uptime from bot ready time
        const botUptime = client.uptime || (this.metrics.botReadyTime ? Date.now() - this.metrics.botReadyTime : 0);
        
        // Format uptime with better precision
        let botUptimeString;
        if (botUptime < 60000) {
            // Less than 1 minute - show seconds
            const seconds = Math.floor(botUptime / 1000);
            botUptimeString = `${seconds}s`;
        } else if (botUptime < 3600000) {
            // Less than 1 hour - show minutes and seconds
            const minutes = Math.floor(botUptime / (1000 * 60));
            const seconds = Math.floor((botUptime % (1000 * 60)) / 1000);
            botUptimeString = `${minutes}m ${seconds}s`;
        } else {
            // 1 hour or more - show days, hours, minutes
            const days = Math.floor(botUptime / (1000 * 60 * 60 * 24));
            const hours = Math.floor((botUptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((botUptime % (1000 * 60 * 60)) / (1000 * 60));
            botUptimeString = `${days}d ${hours}h ${minutes}m`;
        }
        
        const embed = new EmbedBuilder()
            .setTitle('📊 Bot Metrics & Health')
            .setColor(0x00FF00)
            .setTimestamp()
            .setFooter({ text: `Bot ID: ${client.user.id}` })
            .addFields(
                {
                    name: '⏱️ Bot Uptime',
                    value: botUptimeString,
                    inline: true
                },
                {
                    name: '👥 Total Users',
                    value: totalUsers.toString(),
                    inline: true
                },
                {
                    name: '🏰 Total Guilds',
                    value: totalGuilds.toString(),
                    inline: true
                },
                {
                    name: '📺 Total Channels',
                    value: totalChannels.toString(),
                    inline: true
                },
                {
                    name: '📈 Commands/Hour',
                    value: Math.round(health.commandsPerHour).toString(),
                    inline: true
                },
                {
                    name: '❌ Error Rate',
                    value: `${health.errorRate.toFixed(2)}%`,
                    inline: true
                },
                {
                    name: '💾 Memory Usage',
                    value: `${Math.round(health.memoryUsage.heapUsed / 1024 / 1024)}MB`,
                    inline: true
                },
                {
                    name: '🔄 Total Commands',
                    value: this.counters.totalCommands.toString(),
                    inline: true
                },
                {
                    name: '⚡ Total Interactions',
                    value: this.counters.totalInteractions.toString(),
                    inline: true
                }
            );

        if (topCommands.length > 0) {
            const commandsText = topCommands
                .map(cmd => `**${cmd.name}**: ${cmd.count} uses (${cmd.successRate.toFixed(1)}% success)`)
                .join('\n');
            
            embed.addFields({
                name: '🔥 Top Commands',
                value: commandsText,
                inline: false
            });
        }

        if (topErrors.length > 0) {
            const errorsText = topErrors
                .map(err => `**${err.error}**: ${err.count} times`)
                .join('\n');
            
            embed.addFields({
                name: '⚠️ Recent Errors',
                value: errorsText,
                inline: false
            });
        }

        return embed;
    }

    /**
     * Resets all metrics
     */
    reset() {
        this.metrics.commands.clear();
        this.metrics.errors.clear();
        this.metrics.apiCalls.clear();
        this.metrics.users.clear();
        this.metrics.guilds.clear();
        this.metrics.startTime = Date.now();
        
        Object.keys(this.counters).forEach(key => {
            this.counters[key] = 0;
        });
    }
}

// Create singleton instance
const metrics = new MetricsCollector();

/**
 * Performance monitoring decorator
 * @param {string} operationName - Name of the operation
 * @returns {Function} Decorator function
 */
function monitorPerformance(operationName) {
    return function(target, propertyName, descriptor) {
        const method = descriptor.value;
        
        descriptor.value = async function(...args) {
            const startTime = Date.now();
            let success = true;
            
            try {
                const result = await method.apply(this, args);
                return result;
            } catch (error) {
                success = false;
                metrics.trackError(error, operationName);
                throw error;
            } finally {
                const executionTime = Date.now() - startTime;
                metrics.trackCommand(operationName, args[0]?.user?.id || 'unknown', executionTime, success);
            }
        };
        
        return descriptor;
    };
}

/**
 * API call monitoring decorator
 * @param {string} serviceName - Name of the API service
 * @returns {Function} Decorator function
 */
function monitorApiCall(serviceName) {
    return function(target, propertyName, descriptor) {
        const method = descriptor.value;
        
        descriptor.value = async function(...args) {
            const startTime = Date.now();
            let success = true;
            
            try {
                const result = await method.apply(this, args);
                return result;
            } catch (error) {
                success = false;
                metrics.trackError(error, `${serviceName}_API`);
                throw error;
            } finally {
                const responseTime = Date.now() - startTime;
                metrics.trackApiCall(serviceName, responseTime, success);
            }
        };
        
        return descriptor;
    };
}

module.exports = {
    metrics,
    MetricsCollector,
    monitorPerformance,
    monitorApiCall
};
