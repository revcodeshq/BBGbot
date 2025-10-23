/**
 * Production Logging System
 * Comprehensive logging with different levels and structured output
 */

const fs = require('fs');
const path = require('path');

class ProductionLogger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.logDir = process.env.LOG_DIR || './logs';
        this.maxLogSize = parseInt(process.env.MAX_LOG_SIZE) || 10 * 1024 * 1024; // 10MB
        this.maxLogFiles = parseInt(process.env.MAX_LOG_FILES) || 5;
        
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
        
        this.colors = {
            error: '\x1b[31m', // Red
            warn: '\x1b[33m',  // Yellow
            info: '\x1b[36m',  // Cyan
            debug: '\x1b[37m', // White
            reset: '\x1b[0m'
        };
        
        this.ensureLogDirectory();
        this.setupProcessHandlers();
    }

    /**
     * Ensures log directory exists
     */
    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * Sets up process event handlers
     */
    setupProcessHandlers() {
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            this.error('Uncaught Exception', { error: error.message, stack: error.stack });
        });

        // Handle unhandled rejections
        process.on('unhandledRejection', (reason, promise) => {
            this.error('Unhandled Rejection', { reason: reason?.toString(), promise: promise?.toString() });
        });

        // Handle process exit
        process.on('exit', (code) => {
            this.info('Process exiting', { code });
        });

        // Handle SIGTERM
        process.on('SIGTERM', () => {
            this.info('SIGTERM received, shutting down gracefully');
            process.exit(0);
        });

        // Handle SIGINT
        process.on('SIGINT', () => {
            this.info('SIGINT received, shutting down gracefully');
            process.exit(0);
        });
    }

    /**
     * Logs a message with specified level
     */
    log(level, message, meta = {}) {
        if (this.levels[level] > this.levels[this.logLevel]) {
            return;
        }

        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            meta,
            pid: process.pid,
            hostname: require('os').hostname()
        };

        // Console output
        this.logToConsole(level, logEntry);
        
        // File output
        this.logToFile(level, logEntry);
        
        // Webhook output for errors in production
        if (level === 'error' && process.env.NODE_ENV === 'production' && process.env.ERROR_WEBHOOK_URL) {
            this.logToWebhook(logEntry);
        }
    }

    /**
     * Logs to console with colors
     */
    logToConsole(level, logEntry) {
        const color = this.colors[level] || this.colors.reset;
        const reset = this.colors.reset;
        
        const metaStr = Object.keys(logEntry.meta).length > 0 
            ? ` ${JSON.stringify(logEntry.meta)}` 
            : '';
        
        console.log(`${color}[${logEntry.timestamp}] ${logEntry.level}: ${logEntry.message}${metaStr}${reset}`);
    }

    /**
     * Logs to file
     */
    logToFile(level, logEntry) {
        const filename = path.join(this.logDir, `${level}.log`);
        const logLine = JSON.stringify(logEntry) + '\n';
        
        try {
            fs.appendFileSync(filename, logLine);
            this.rotateLogFile(filename);
        } catch (error) {
            console.error('Failed to write to log file:', error.message);
        }
    }

    /**
     * Rotates log file if it exceeds max size
     */
    rotateLogFile(filename) {
        try {
            const stats = fs.statSync(filename);
            if (stats.size > this.maxLogSize) {
                // Rotate existing files
                for (let i = this.maxLogFiles - 1; i > 0; i--) {
                    const oldFile = `${filename}.${i}`;
                    const newFile = `${filename}.${i + 1}`;
                    
                    if (fs.existsSync(oldFile)) {
                        if (i === this.maxLogFiles - 1) {
                            fs.unlinkSync(oldFile); // Delete oldest
                        } else {
                            fs.renameSync(oldFile, newFile);
                        }
                    }
                }
                
                // Move current file to .1
                fs.renameSync(filename, `${filename}.1`);
            }
        } catch (error) {
            console.error('Failed to rotate log file:', error.message);
        }
    }

    /**
     * Logs to webhook for error reporting
     */
    async logToWebhook(logEntry) {
        try {
            const { WebhookClient } = require('discord.js');
            const webhook = new WebhookClient({ url: process.env.ERROR_WEBHOOK_URL });
            
            const embed = {
                title: '🚨 Bot Error Report',
                color: 0xff0000,
                fields: [
                    { name: 'Level', value: logEntry.level, inline: true },
                    { name: 'Message', value: logEntry.message, inline: false },
                    { name: 'Timestamp', value: logEntry.timestamp, inline: true },
                    { name: 'PID', value: logEntry.pid.toString(), inline: true },
                    { name: 'Hostname', value: logEntry.hostname, inline: true }
                ],
                timestamp: new Date().toISOString()
            };

            if (Object.keys(logEntry.meta).length > 0) {
                embed.fields.push({
                    name: 'Metadata',
                    value: '```json\n' + JSON.stringify(logEntry.meta, null, 2) + '\n```',
                    inline: false
                });
            }

            await webhook.send({ embeds: [embed] });
        } catch (error) {
            console.error('Failed to send error webhook:', error.message);
        }
    }

    /**
     * Error level logging
     */
    error(message, meta = {}) {
        this.log('error', message, meta);
    }

    /**
     * Warning level logging
     */
    warn(message, meta = {}) {
        this.log('warn', message, meta);
    }

    /**
     * Info level logging
     */
    info(message, meta = {}) {
        this.log('info', message, meta);
    }

    /**
     * Debug level logging
     */
    debug(message, meta = {}) {
        this.log('debug', message, meta);
    }

    /**
     * Logs command execution
     */
    logCommand(commandName, userId, guildId, executionTime, success) {
        this.info('Command executed', {
            command: commandName,
            userId,
            guildId,
            executionTime,
            success
        });
    }

    /**
     * Logs interaction events
     */
    logInteraction(type, userId, guildId, channelId) {
        this.debug('Interaction event', {
            type,
            userId,
            guildId,
            channelId
        });
    }

    /**
     * Logs database operations
     */
    logDatabase(operation, collection, duration, success) {
        this.debug('Database operation', {
            operation,
            collection,
            duration,
            success
        });
    }

    /**
     * Logs API calls
     */
    logAPI(service, endpoint, method, statusCode, duration) {
        this.debug('API call', {
            service,
            endpoint,
            method,
            statusCode,
            duration
        });
    }

    /**
     * Logs performance metrics
     */
    logPerformance(metric, value, unit = 'ms') {
        this.debug('Performance metric', {
            metric,
            value,
            unit
        });
    }

    /**
     * Gets log statistics
     */
    getLogStats() {
        const stats = {};
        
        for (const level of Object.keys(this.levels)) {
            const filename = path.join(this.logDir, `${level}.log`);
            if (fs.existsSync(filename)) {
                const content = fs.readFileSync(filename, 'utf8');
                const lines = content.split('\n').filter(line => line.trim());
                stats[level] = lines.length;
            } else {
                stats[level] = 0;
            }
        }
        
        return stats;
    }
}

// Create singleton instance
const logger = new ProductionLogger();

module.exports = logger;
