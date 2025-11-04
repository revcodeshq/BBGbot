/**
 * Enhanced Command Processing System
 * Handles command queuing, cooldowns, and priorities
 */

class CommandProcessor {
    constructor() {
        this.commandQueue = new Map();
        this.cooldowns = new Map();
        this.activeCommands = new Map();
        
        // Command priorities (higher number = higher priority)
        this.priorities = {
            'redeem': 1,      // Heavy command
            'verify': 3,      // Important user command
            'help': 5,        // Quick response needed
            'default': 2      // Default priority
        };

        // Cooldown times in milliseconds
        this.cooldownTimes = {
            'redeem': 30000,      // 30 seconds between redeem commands
            'verify': 60000,      // 1 minute between verify attempts
            'feedback': 300000,   // 5 minutes between feedback
            'default': 3000       // 3 second default cooldown
        };

        // Maximum concurrent commands per type
        this.maxConcurrent = {
            'redeem': 1,      // Only one redeem at a time
            'verify': 3,      // Up to 3 verify commands
            'default': 5      // Default max concurrent
        };
    }

    /**
     * Gets priority for a command
     * @param {string} commandName - Name of the command
     * @returns {number} Priority level
     */
    getPriority(commandName) {
        return this.priorities[commandName] || this.priorities.default;
    }

    /**
     * Gets cooldown time for a command
     * @param {string} commandName - Name of the command
     * @returns {number} Cooldown time in milliseconds
     */
    getCooldownTime(commandName) {
        return this.cooldownTimes[commandName] || this.cooldownTimes.default;
    }

    /**
     * Gets max concurrent executions for a command
     * @param {string} commandName - Name of the command
     * @returns {number} Maximum concurrent executions
     */
    getMaxConcurrent(commandName) {
        return this.maxConcurrent[commandName] || this.maxConcurrent.default;
    }

    /**
     * Checks if a command is on cooldown
     * @param {string} commandName - Name of the command
     * @param {string} userId - User ID
     * @returns {number} Time remaining in cooldown or 0 if not on cooldown
     */
    getCooldownRemaining(commandName, userId) {
        const key = `${commandName}-${userId}`;
        const cooldown = this.cooldowns.get(key);
        if (!cooldown) return 0;

        const remaining = cooldown - Date.now();
        if (remaining <= 0) {
            this.cooldowns.delete(key);
            return 0;
        }
        return remaining;
    }

    /**
     * Sets cooldown for a command
     * @param {string} commandName - Name of the command
     * @param {string} userId - User ID
     */
    setCooldown(commandName, userId) {
        const key = `${commandName}-${userId}`;
        const cooldownTime = this.getCooldownTime(commandName);
        this.cooldowns.set(key, Date.now() + cooldownTime);
    }

    /**
     * Checks if command can be executed based on concurrency limits
     * @param {string} commandName - Name of the command
     * @returns {boolean} Whether command can be executed
     */
    canExecute(commandName) {
        const active = this.activeCommands.get(commandName) || 0;
        return active < this.getMaxConcurrent(commandName);
    }

    /**
     * Processes a command with queuing and priority
     * @param {string} commandName - Name of the command
     * @param {string} userId - User ID
     * @param {Function} executeFunction - Function to execute command
     * @returns {Promise} Command result
     */
    async processCommand(commandName, userId, executeFunction) {
        // Check cooldown
        const cooldownRemaining = this.getCooldownRemaining(commandName, userId);
        if (cooldownRemaining > 0) {
            throw new Error(`Command on cooldown. Please wait ${Math.ceil(cooldownRemaining / 1000)} seconds.`);
        }

        // Get queue for this command
        if (!this.commandQueue.has(commandName)) {
            this.commandQueue.set(commandName, []);
        }
        const queue = this.commandQueue.get(commandName);

        // Create execution promise
        const executionPromise = new Promise((resolve, reject) => {
            const queueItem = {
                userId,
                priority: this.getPriority(commandName),
                execute: async () => {
                    try {
                        // Track active command
                        const currentActive = this.activeCommands.get(commandName) || 0;
                        this.activeCommands.set(commandName, currentActive + 1);

                        // Execute command
                        const result = await executeFunction();

                        // Set cooldown
                        this.setCooldown(commandName, userId);

                        // Cleanup
                        this.activeCommands.set(commandName, (this.activeCommands.get(commandName) || 1) - 1);
                        resolve(result);
                    } catch (error) {
                        reject(error);
                    }
                }
            };

            // Add to queue
            queue.push(queueItem);
            
            // Sort queue by priority
            queue.sort((a, b) => b.priority - a.priority);
        });

        // Process queue
        this.processQueue(commandName);

        return executionPromise;
    }

    /**
     * Processes command queue
     * @param {string} commandName - Name of the command
     */
    async processQueue(commandName) {
        const queue = this.commandQueue.get(commandName);
        if (!queue || queue.length === 0) return;

        // Check if we can execute more commands
        if (!this.canExecute(commandName)) return;

        // Get next command
        const nextCommand = queue.shift();
        if (!nextCommand) return;

        // Execute command
        try {
            await nextCommand.execute();
        } catch (error) {
            console.error(`Error executing queued command ${commandName}:`, error);
        }

        // Process next in queue
        this.processQueue(commandName);
    }

    /**
     * Cleans up completed commands and expired cooldowns
     */
    cleanup() {
        const now = Date.now();
        
        // Clean cooldowns
        for (const [key, time] of this.cooldowns.entries()) {
            if (time <= now) {
                this.cooldowns.delete(key);
            }
        }

        // Clean empty queues
        for (const [commandName, queue] of this.commandQueue.entries()) {
            if (queue.length === 0) {
                this.commandQueue.delete(commandName);
            }
        }
    }

    /**
     * Gets queue status for a command
     * @param {string} commandName - Name of the command
     * @returns {Object} Queue status
     */
    getQueueStatus(commandName) {
        return {
            queueLength: (this.commandQueue.get(commandName) || []).length,
            activeTasks: this.activeCommands.get(commandName) || 0,
            maxConcurrent: this.getMaxConcurrent(commandName)
        };
    }
}

module.exports = new CommandProcessor();