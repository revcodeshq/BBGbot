require('dotenv').config();

/**
 * Configuration utility for BBG Discord Bot
 * Centralizes all configuration settings with fallback defaults
 */

const config = {
    // Discord Configuration
    discord: {
        botToken: process.env.BOT_TOKEN,
        guildId: process.env.GUILD_ID || '1421956605787770913',
    },

    // Database Configuration
    database: {
        mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/bbgbot',
    },

    // Role Configuration
    roles: {
        defaultRole: process.env.DEFAULT_MEMBER_ROLE_ID || '1421959206751440996',
        memberRole: process.env.MEMBER_ROLE_ID || '1421959390570873003',
        bt1Role: process.env.BT1_ROLE_ID,
        bt2Role: process.env.BT2_ROLE_ID,
    },

    // Channel Configuration
    channels: {
        welcome: process.env.WELCOME_CHANNEL_ID || '1422944137224781866',
        announcements: process.env.ANNOUNCEMENTS_CHANNEL_ID || '1421960221110308967',
        eventSchedule: process.env.EVENT_SCHEDULE_CHANNEL_ID || '1421961434832830526',
        general: process.env.GENERAL_CHANNEL_ID || '1421965122850525305',
        verify: process.env.VERIFY_CHANNEL_ID,
        botActivity: process.env.BOT_ACTIVITY_CHANNEL_ID,
    },

    // API Configuration
    api: {
        geminiApiKey: process.env.GEMINI_API_KEY || "",
        wosApiSecret: process.env.WOS_API_SECRET || "tB87#kPtkxqOS2",
        twoCaptchaApiKey: process.env.TWO_CAPTCHA_API_KEY,
    },

    // Feature Flags
    features: {
        enableTranslation: process.env.ENABLE_TRANSLATION === 'true',
        enableGiftRedemption: process.env.ENABLE_GIFT_REDEMPTION === 'true',
        enableAiGuide: process.env.ENABLE_AI_GUIDE === 'true',
        enableNicknameSync: process.env.ENABLE_NICKNAME_SYNC === 'true',
    },

    // Advanced Settings
    advanced: {
        apiTimeout: parseInt(process.env.API_TIMEOUT) || 30000,
        captchaTimeout: parseInt(process.env.CAPTCHA_TIMEOUT) || 120000,
        translationCacheTtl: parseInt(process.env.TRANSLATION_CACHE_TTL) || 3600,
        nicknameSyncInterval: parseInt(process.env.NICKNAME_SYNC_INTERVAL) || 600000,
        announcementCheckInterval: parseInt(process.env.ANNOUNCEMENT_CHECK_INTERVAL) || 60000,
        botInfoUpdateInterval: parseInt(process.env.BOT_INFO_UPDATE_INTERVAL) || 300000,
    },

    // Development Settings
    development: {
        nodeEnv: process.env.NODE_ENV || 'development',
        logLevel: process.env.LOG_LEVEL || 'info',
    },

    // Welcome Message Configuration
    welcomeMessage: {
        title: process.env.WELCOME_MESSAGE_TITLE || "BBG - BeersBaconGlory",
        verifyChannelName: process.env.VERIFY_CHANNEL_NAME || "✅-verify",
    },
};

/**
 * Validates that required configuration values are present
 * @returns {Array} Array of missing required configuration keys
 */
function validateConfig() {
    const required = [
        'discord.botToken',
        'database.mongoUri',
    ];

    const missing = [];
    
    for (const key of required) {
        const keys = key.split('.');
        let current = config;
        
        for (const k of keys) {
            current = current[k];
            if (current === undefined || current === null || current === '') {
                missing.push(key);
                break;
            }
        }
    }
    
    return missing;
}

/**
 * Gets a configuration value by dot notation path
 * @param {string} path - Dot notation path (e.g., 'discord.botToken')
 * @param {*} defaultValue - Default value if path doesn't exist
 * @returns {*} Configuration value
 */
function get(path, defaultValue = undefined) {
    const keys = path.split('.');
    let current = config;
    
    for (const key of keys) {
        if (current[key] === undefined) {
            return defaultValue;
        }
        current = current[key];
    }
    
    return current;
}

/**
 * Checks if a feature is enabled
 * @param {string} featureName - Name of the feature
 * @returns {boolean} Whether the feature is enabled
 */
function isFeatureEnabled(featureName) {
    return get(`features.${featureName}`, false);
}

module.exports = {
    config,
    validateConfig,
    get,
    isFeatureEnabled,
};