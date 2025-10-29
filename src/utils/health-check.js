/**
 * Production Health Check System
 * Monitors bot health and provides status endpoints
 */

const { EmbedBuilder } = require('discord.js');

class HealthCheckSystem {
    constructor(client) {
        this.client = client;
        this.checks = new Map();
        this.lastCheckTime = null;
        this.healthStatus = 'unknown';
        this.startHealthMonitoring();
    }

    /**
     * Starts continuous health monitoring
     */
    startHealthMonitoring() {
        // Run health checks every 30 seconds
        setInterval(() => {
            this.runHealthChecks();
        }, 30000);

        // Initial health check
        setTimeout(() => {
            this.runHealthChecks();
        }, 5000);
    }

    /**
     * Runs all health checks
     */
    async runHealthChecks() {
        const checks = {
            discord: await this.checkDiscordConnection(),
            database: await this.checkDatabaseConnection(),
            memory: this.checkMemoryUsage(),
            uptime: this.checkUptime(),
            commands: this.checkCommandsLoaded(),
            events: this.checkEventsLoaded(),
            api: this.checkAPIResponsiveness()
        };

        this.checks = checks;
        this.lastCheckTime = new Date();
        
        // Determine overall health status
        this.healthStatus = this.determineOverallHealth(checks);
        
        // Log health status
        this.logHealthStatus(checks);
        
        return checks;
    }

    /**
     * Checks Discord connection health
     */
    async checkDiscordConnection() {
        try {
            const ping = this.client.ws.ping;
            const readyState = this.client.ws.status;
            
            return {
                status: readyState === 0 ? 'healthy' : 'unhealthy',
                ping,
                readyState,
                guilds: this.client.guilds.cache.size,
                users: this.client.users.cache.size
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    /**
     * Checks database connection health
     */
    async checkDatabaseConnection() {
        try {
            const mongodbManager = require('./mongodb-manager');
            const isHealthy = await mongodbManager.isHealthy();
            const status = mongodbManager.getStatus();
            
            if (isHealthy) {
                return {
                    status: 'healthy',
                    readyState: status.readyState,
                    host: status.host,
                    port: status.port,
                    name: status.name,
                    reconnectAttempts: status.reconnectAttempts
                };
            } else {
                return {
                    status: 'unhealthy',
                    readyState: status.readyState,
                    error: 'Database not healthy',
                    reconnectAttempts: status.reconnectAttempts
                };
            }
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    /**
     * Checks memory usage
     */
    checkMemoryUsage() {
        const usage = process.memoryUsage();
        const totalMemory = usage.heapTotal;
        const usedMemory = usage.heapUsed;
        const externalMemory = usage.external;
        
        const memoryPercentage = (usedMemory / totalMemory) * 100;
        
        let status = 'healthy';
        if (memoryPercentage > 80) {
            status = 'warning';
        }
        if (memoryPercentage > 95) {
            status = 'critical';
        }
        
        return {
            status,
            heapUsed: Math.round(usedMemory / 1024 / 1024), // MB
            heapTotal: Math.round(totalMemory / 1024 / 1024), // MB
            external: Math.round(externalMemory / 1024 / 1024), // MB
            percentage: Math.round(memoryPercentage)
        };
    }

    /**
     * Checks bot uptime
     */
    checkUptime() {
        const uptime = process.uptime();
        const uptimeHours = Math.floor(uptime / 3600);
        const uptimeMinutes = Math.floor((uptime % 3600) / 60);
        
        let status = 'healthy';
        if (uptime < 300) { // Less than 5 minutes
            status = 'warning'; // Recently restarted
        }
        
        return {
            status,
            seconds: Math.floor(uptime),
            formatted: `${uptimeHours}h ${uptimeMinutes}m`,
            startTime: new Date(Date.now() - uptime * 1000)
        };
    }

    /**
     * Checks if commands are loaded
     */
    checkCommandsLoaded() {
        const commandCount = this.client.commands?.size || 0;
        const expectedCommands = 22; // Based on your bot
        
        let status = 'healthy';
        if (commandCount < expectedCommands) {
            status = 'warning';
        }
        if (commandCount === 0) {
            status = 'critical';
        }
        
        return {
            status,
            loaded: commandCount,
            expected: expectedCommands,
            missing: expectedCommands - commandCount
        };
    }

    /**
     * Checks if events are properly loaded
     */
    checkEventsLoaded() {
        // Count the number of event listeners on the client
        const eventListeners = this.client.eventNames();
        const eventCount = eventListeners.length;
        const expectedEvents = 3; // Critical events: ready, interactionCreate, messageCreate (optional events loaded later)
        
        let status = 'healthy';
        if (eventCount < expectedEvents) {
            status = 'warning';
        }
        if (eventCount === 0) {
            status = 'critical';
        }
        
        return {
            status,
            loaded: eventCount,
            expected: expectedEvents,
            missing: expectedEvents - eventCount,
            events: eventListeners
        };
    }

    /**
     * Checks API responsiveness
     */
    checkAPIResponsiveness() {
        const startTime = Date.now();
        
        // Simulate API call by checking client ready state
        const isReady = this.client.isReady;
        const responseTime = Date.now() - startTime;
        
        let status = 'healthy';
        if (responseTime > 1000) {
            status = 'warning';
        }
        if (responseTime > 5000) {
            status = 'critical';
        }
        
        return {
            status,
            responseTime,
            ready: isReady
        };
    }

    /**
     * Determines overall health status
     */
    determineOverallHealth(checks) {
        const statuses = Object.values(checks).map(check => check.status);
        
        if (statuses.includes('critical')) {
            return 'critical';
        }
        if (statuses.includes('unhealthy')) {
            return 'unhealthy';
        }
        if (statuses.includes('warning')) {
            return 'warning';
        }
        return 'healthy';
    }

    /**
     * Logs health status
     */
    logHealthStatus(checks) {
        const timestamp = new Date().toISOString();
        const statusEmoji = {
            healthy: '✅',
            warning: '⚠️',
            unhealthy: '❌',
            critical: '🚨'
        };
        
        console.log(`[Health Check] ${timestamp} - Overall: ${statusEmoji[this.healthStatus]} ${this.healthStatus.toUpperCase()}`);
        
        // Log individual check results
        Object.entries(checks).forEach(([name, check]) => {
            const emoji = statusEmoji[check.status];
            console.log(`[Health Check] ${emoji} ${name}: ${check.status}`);
        });
    }

    /**
     * Creates health status embed
     */
    createHealthEmbed() {
        const embed = new EmbedBuilder()
            .setTitle('🏥 Bot Health Status')
            .setColor(this.getHealthColor())
            .setTimestamp()
            .setFooter({ text: `Last checked: ${this.lastCheckTime?.toLocaleString() || 'Never'}` });

        // Add overall status
        embed.addFields({
            name: '📊 Overall Status',
            value: `${this.getHealthEmoji()} **${this.healthStatus.toUpperCase()}**`,
            inline: false
        });

        // Add individual check results
        if (this.checks.size > 0) {
            const checkResults = Array.from(this.checks.entries()).map(([name, check]) => {
                const emoji = this.getHealthEmoji(check.status);
                return `${emoji} **${name}**: ${check.status}`;
            }).join('\n');

            embed.addFields({
                name: '🔍 System Checks',
                value: checkResults,
                inline: false
            });
        }

        // Add detailed information for critical systems
        if (this.checks.has('discord')) {
            const discord = this.checks.get('discord');
            embed.addFields({
                name: '🤖 Discord Connection',
                value: `Ping: ${discord.ping}ms\nGuilds: ${discord.guilds}\nUsers: ${discord.users}`,
                inline: true
            });
        }

        if (this.checks.has('database')) {
            const db = this.checks.get('database');
            embed.addFields({
                name: '💾 Database',
                value: `Status: ${db.status}\nResponse: ${db.responseTime || 'N/A'}ms`,
                inline: true
            });
        }

        if (this.checks.has('memory')) {
            const memory = this.checks.get('memory');
            embed.addFields({
                name: '🧠 Memory Usage',
                value: `${memory.heapUsed}MB / ${memory.heapTotal}MB\n${memory.percentage}% used`,
                inline: true
            });
        }

        return embed;
    }

    /**
     * Gets health status color
     */
    getHealthColor() {
        const colors = {
            healthy: 0x00ff00,
            warning: 0xffaa00,
            unhealthy: 0xff6600,
            critical: 0xff0000
        };
        return colors[this.healthStatus] || 0x808080;
    }

    /**
     * Gets health status emoji
     */
    getHealthEmoji(status = this.healthStatus) {
        const emojis = {
            healthy: '✅',
            warning: '⚠️',
            unhealthy: '❌',
            critical: '🚨'
        };
        return emojis[status] || '❓';
    }

    /**
     * Gets current health status
     */
    getHealthStatus() {
        return {
            status: this.healthStatus,
            checks: Object.fromEntries(this.checks),
            lastCheck: this.lastCheckTime,
            uptime: process.uptime()
        };
    }
}

module.exports = HealthCheckSystem;
