/**
 * Interaction Handler Utility
 * Provides standardized interaction handling patterns for all commands
 */

const { ErrorHandler } = require('./error-handler');
const { metrics } = require('./metrics');
const { performanceMonitor } = require('./performance-monitor');
const { smartRateLimiter } = require('./smart-rate-limiter');

class InteractionHandler {
    /**
     * Executes a command with standardized error handling and metrics
     * @param {Object} interaction - Discord interaction
     * @param {Function} commandFunction - Command execution function
     * @param {Object} options - Execution options
     */

    static async executeCommand(interaction, command, options = {}) {
        const startTime = Date.now();
        const commandName = interaction.commandName;
        const userId = interaction.user.id;

        // Debug logging
        const interactionAge = Date.now() - interaction.createdTimestamp;
        console.log(`[InteractionHandler] Processing ${commandName} - Age: ${interactionAge}ms, Expired: ${this.isInteractionExpired(interaction)}`);

        try {
            // Check if interaction is still valid before deferring
            if (this.isInteractionExpired(interaction)) {
                console.warn(`[InteractionHandler] Interaction expired for command: ${commandName} (Age: ${interactionAge}ms)`);
                return;
            }

            // Additional safety check - if interaction is very old, skip it
            if (interactionAge > 3 * 60 * 1000) { // 3 minutes
                console.warn(`[InteractionHandler] Interaction too old for command: ${commandName} (Age: ${interactionAge}ms)`);
                return;
            }

            // Check if command should not be deferred (e.g., for modal commands)
            const shouldDefer = !command.noDefer;

            if (shouldDefer) {
                // Use ephemeral option if provided, default to false
                const ephemeral = options.ephemeral === true;
                try {
                    await interaction.deferReply({ ephemeral });
                } catch (deferError) {
                    if (deferError.code === 10062) {
                        console.warn(`[InteractionHandler] Interaction expired during defer for command: ${commandName}`);
                        return;
                    }
                    throw deferError; // Re-throw other errors
                }
            }

            // Execute the command function
            const result = await command.execute(interaction);

            // Track successful execution
            const executionTime = Date.now() - startTime;
            metrics.trackCommand(commandName, userId, executionTime, true);
            performanceMonitor.trackResponseTime(commandName, executionTime);
            smartRateLimiter.recordSuccess(`${commandName}:${userId}`, executionTime);

            return result;
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // Track failed execution
            metrics.trackCommand(commandName, userId, executionTime, false);
            performanceMonitor.trackError(`${commandName}_command`, error.message);
            smartRateLimiter.recordFailure(`${commandName}:${userId}`, 'command_error');
            
            // Handle error
            const errorResponse = ErrorHandler.handleError(error, {
                interaction,
                user: interaction.user,
                guild: interaction.guild,
                channel: interaction.channel,
                command: commandName
            });

            // Send error response only if interaction is still valid
            try {
                if (this.isInteractionValid(interaction)) {
                    if (interaction.deferred && !interaction.replied) {
                        await interaction.editReply({
                            content: errorResponse.userMessage
                        });
                    } else if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: errorResponse.userMessage,
                            flags: 64
                        });
                    }
                }
            } catch (replyError) {
                console.error('Failed to send error response:', replyError.message);
            }
            
            throw error; // Re-throw for any additional handling
        }
    }

    /**
     * Checks if an interaction has expired
     * @param {Object} interaction - Discord interaction
     * @returns {boolean} True if expired
     */
    static isInteractionExpired(interaction) {
        // Discord interactions expire after 15 minutes
        const interactionAge = Date.now() - interaction.createdTimestamp;
        return interactionAge > 15 * 60 * 1000; // 15 minutes in milliseconds
    }

    /**
     * Checks if an interaction is still valid for responding
     * @param {Object} interaction - Discord interaction
     * @returns {boolean} True if valid
     */
    static isInteractionValid(interaction) {
        // Check if interaction is expired
        if (this.isInteractionExpired(interaction)) {
            return false;
        }
        
        // Check if interaction has already been replied to
        if (interaction.replied) {
            return false;
        }
        
        return true;
    }

    /**
     * Handles button interactions with error handling
     * @param {Object} interaction - Discord interaction
     * @param {Function} handlerFunction - Handler function
     */
    static async handleButton(interaction, handlerFunction) {
        try {
            await handlerFunction(interaction);
        } catch (error) {
            const errorResponse = ErrorHandler.handleError(error, {
                interaction,
                user: interaction.user,
                guild: interaction.guild,
                channel: interaction.channel,
                interactionType: 'button'
            });

            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: errorResponse.userMessage,
                        flags: 64
                    });
                } else if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({
                        content: errorResponse.userMessage
                    });
                }
            } catch (replyError) {
                console.error('Failed to send button error response:', replyError.message);
            }
        }
    }

    /**
     * Handles modal interactions with error handling
     * @param {Object} interaction - Discord interaction
     * @param {Function} handlerFunction - Handler function
     */
    static async handleModal(interaction, handlerFunction) {
        try {
            await handlerFunction(interaction);
        } catch (error) {
            const errorResponse = ErrorHandler.handleError(error, {
                interaction,
                user: interaction.user,
                guild: interaction.guild,
                channel: interaction.channel,
                interactionType: 'modal'
            });

            try {
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: errorResponse.userMessage,
                        flags: 64
                    });
                } else if (interaction.deferred && !interaction.replied) {
                    await interaction.editReply({
                        content: errorResponse.userMessage
                    });
                }
            } catch (replyError) {
                console.error('Failed to send modal error response:', replyError.message);
            }
        }
    }

    /**
     * Safely replies to an interaction
     * @param {Object} interaction - Discord interaction
     * @param {Object} options - Reply options
     */
    static async safeReply(interaction, options) {
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply(options);
            } else if (interaction.deferred && !interaction.replied) {
                await interaction.editReply(options);
            }
        } catch (error) {
            console.error('Failed to reply to interaction:', error.message);
        }
    }

    /**
     * Safely defers an interaction reply
     * @param {Object} interaction - Discord interaction
     * @param {Object} options - Defer options
     */
    static async safeDefer(interaction, options = { flags: 64 }) {
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.deferReply(options);
            }
        } catch (error) {
            console.error('Failed to defer interaction:', error.message);
        }
    }
}

module.exports = InteractionHandler;
