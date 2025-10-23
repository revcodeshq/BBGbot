/**
 * Input Validation Utilities
 * Comprehensive validation functions for user inputs
 */

class Validators {
    /**
     * Validates FID format
     * @param {string} fid - FID to validate
     * @returns {boolean} True if valid
     */
    static validateFID(fid) {
        if (!fid || typeof fid !== 'string') return false;
        return /^\d{6,15}$/.test(fid.trim());
    }

    /**
     * Validates time string format
     * @param {string} timeStr - Time string to validate
     * @returns {boolean} True if valid
     */
    static validateTimeString(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return false;
        
        const trimmed = timeStr.trim();
        if (trimmed.length === 0) return false;

        // Common time patterns
        const patterns = [
            /^\d{1,2}:\d{2}$/, // HH:MM format
            /^in \d+ (minute|hour|day|week)s?$/i, // "in X minutes/hours/days/weeks"
            /^at \d{1,2}(:\d{2})? (am|pm)$/i, // "at 9pm" or "at 9:30pm"
            /^tomorrow at \d{1,2}(:\d{2})? (am|pm)?$/i, // "tomorrow at 9pm"
            /^\d{1,2} (am|pm)$/i, // "9pm"
            /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday) at \d{1,2}(:\d{2})? (am|pm)?$/i // "monday at 9pm"
        ];

        return patterns.some(pattern => pattern.test(trimmed));
    }

    /**
     * Validates channel name format
     * @param {string} channelName - Channel name to validate
     * @returns {boolean} True if valid
     */
    static validateChannelName(channelName) {
        if (!channelName || typeof channelName !== 'string') return false;
        
        const trimmed = channelName.trim();
        if (trimmed.length === 0 || trimmed.length > 100) return false;
        
        // Discord channel name rules
        return /^[a-z0-9\-_]+$/i.test(trimmed);
    }

    /**
     * Validates user input for XSS prevention
     * @param {string} input - Input to validate
     * @returns {boolean} True if safe
     */
    static validateUserInput(input) {
        if (!input || typeof input !== 'string') return false;
        
        // Check for potentially dangerous patterns
        const dangerousPatterns = [
            /<script/i,
            /javascript:/i,
            /on\w+\s*=/i,
            /<iframe/i,
            /<object/i,
            /<embed/i,
            /<link/i,
            /<meta/i
        ];

        return !dangerousPatterns.some(pattern => pattern.test(input));
    }

    /**
     * Sanitizes user input
     * @param {string} input - Input to sanitize
     * @returns {string} Sanitized input
     */
    static sanitizeInput(input) {
        if (!input || typeof input !== 'string') return '';
        
        return input
            .trim()
            .replace(/[<>]/g, '') // Remove angle brackets
            .substring(0, 2000); // Limit length
    }

    /**
     * Validates Discord user ID
     * @param {string} userId - User ID to validate
     * @returns {boolean} True if valid
     */
    static validateDiscordId(userId) {
        if (!userId || typeof userId !== 'string') return false;
        return /^\d{17,19}$/.test(userId);
    }

    /**
     * Validates Discord role ID
     * @param {string} roleId - Role ID to validate
     * @returns {boolean} True if valid
     */
    static validateRoleId(roleId) {
        return this.validateDiscordId(roleId);
    }

    /**
     * Validates Discord channel ID
     * @param {string} channelId - Channel ID to validate
     * @returns {boolean} True if valid
     */
    static validateChannelId(channelId) {
        return this.validateDiscordId(channelId);
    }

    /**
     * Validates email format
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid
     */
    static validateEmail(email) {
        if (!email || typeof email !== 'string') return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email.trim());
    }

    /**
     * Validates URL format
     * @param {string} url - URL to validate
     * @returns {boolean} True if valid
     */
    static validateURL(url) {
        if (!url || typeof url !== 'string') return false;
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Validates duration string (e.g., "1h", "30m", "2d")
     * @param {string} duration - Duration string to validate
     * @returns {boolean} True if valid
     */
    static validateDuration(duration) {
        if (!duration || typeof duration !== 'string') return false;
        return /^\d+[smhd]$/i.test(duration.trim());
    }

    /**
     * Validates poll options
     * @param {Array} options - Poll options array
     * @returns {boolean} True if valid
     */
    static validatePollOptions(options) {
        if (!Array.isArray(options)) return false;
        if (options.length < 2 || options.length > 10) return false;
        
        return options.every(option => 
            typeof option === 'string' && 
            option.trim().length > 0 && 
            option.trim().length <= 100
        );
    }

    /**
     * Validates giveaway parameters
     * @param {Object} params - Giveaway parameters
     * @returns {Object} Validation result with isValid and errors
     */
    static validateGiveawayParams(params) {
        const errors = [];
        
        if (!params.prize || typeof params.prize !== 'string' || params.prize.trim().length === 0) {
            errors.push('Prize is required');
        }
        
        if (!params.winnerCount || !Number.isInteger(params.winnerCount) || params.winnerCount < 1 || params.winnerCount > 10) {
            errors.push('Winner count must be between 1 and 10');
        }
        
        if (!params.duration || !this.validateDuration(params.duration)) {
            errors.push('Duration must be in format like "1h", "30m", "2d"');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

// Export individual functions for easier importing
module.exports = {
    ...Validators,
    validateFID: Validators.validateFID,
    validateTimeString: Validators.validateTimeString,
    validateChannelName: Validators.validateChannelName,
    validateUserInput: Validators.validateUserInput,
    sanitizeInput: Validators.sanitizeInput,
    validateDiscordId: Validators.validateDiscordId,
    validateRoleId: Validators.validateRoleId,
    validateChannelId: Validators.validateChannelId,
    validateEmail: Validators.validateEmail,
    validateURL: Validators.validateURL,
    validateDuration: Validators.validateDuration,
    validatePollOptions: Validators.validatePollOptions,
    validateGiveawayParams: Validators.validateGiveawayParams,
    // Add gift code validation
    validateGiftCode: (code) => {
        if (!code || typeof code !== 'string') return false;
        const trimmed = code.trim();
        return trimmed.length >= 4 && trimmed.length <= 20 && /^[A-Za-z0-9]+$/.test(trimmed);
    }
};
