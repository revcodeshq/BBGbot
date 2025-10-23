/**
 * Player Info Service
 * Handles Whiteout Survival player data fetching with caching and enhanced error handling
 */

const axios = require('axios');
const crypto = require('crypto');
const { get } = require('../utils/config');
const { cache } = require('../utils/cache');
const { APIError, ValidationError } = require('../utils/error-handler');
const { metrics } = require('../utils/metrics');

class PlayerInfoService {
    constructor() {
        this.apiEndpoint = 'https://wos-giftcode-api.centurygame.com/api/player';
        this.apiSecret = get('api.wosApiSecret');
        this.baseFurnaceLevel = 30;
        
        this.levelMapping = {
            31: "30-1", 32: "30-2", 33: "30-3", 34: "30-4",
            35: "FC 1", 36: "FC 1 - 1", 37: "FC 1 - 2", 38: "FC 1 - 3", 39: "FC 1 - 4",
            40: "FC 2", 41: "FC 2 - 1", 42: "FC 2 - 2", 43: "FC 2 - 3", 44: "FC 2 - 4",
            45: "FC 3", 46: "FC 3 - 1", 47: "FC 3 - 2", 48: "FC 3 - 3", 49: "FC 3 - 4",
            50: "FC 4", 51: "FC 4 - 1", 52: "FC 4 - 2", 53: "FC 4 - 3", 54: "FC 4 - 4",
            55: "FC 5", 56: "FC 5 - 1", 57: "FC 5 - 2", 58: "FC 5 - 3", 59: "FC 5 - 4",
            60: "FC 6", 61: "FC 6 - 1", 62: "FC 6 - 2", 63: "FC 6 - 3", 64: "FC 6 - 4",
            65: "FC 7", 66: "FC 7 - 1", 67: "FC 7 - 2", 68: "FC 7 - 3", 69: "FC 7 - 4",
            70: "FC 8", 71: "FC 8 - 1", 72: "FC 8 - 2", 73: "FC 8 - 3", 74: "FC 8 - 4",
            75: "FC 9", 76: "FC 9 - 1", 77: "FC 9 - 2", 78: "FC 9 - 3", 79: "FC 9 - 4",
            80: "FC 10", 81: "FC 10 - 1", 82: "FC 10 - 2", 83: "FC 10 - 3", 84: "FC 10 - 4"
        };
    }

    /**
     * Validates FID format
     * @param {string} fid - FID to validate
     * @returns {boolean} True if valid
     */
    validateFID(fid) {
        if (!fid || typeof fid !== 'string') return false;
        return /^\d{6,15}$/.test(fid.trim());
    }

    /**
     * Fetches game data for a player with caching
     * @param {string} gameId - Player's game ID (FID)
     * @returns {Promise<Object>} Player game data
     */
    async fetchGameData(gameId) {
        try {
            // Validate FID
            if (!this.validateFID(gameId)) {
                throw new ValidationError('Invalid FID format', 'gameId');
            }

            // Check cache first
            const cacheKey = `player_${gameId}`;
            const cachedData = cache.get(cacheKey);
            if (cachedData) {
                metrics.trackApiCall('WOS_API', 0, true, true); // Cache hit
                return cachedData;
            }

            // Fetch from API
            const gameData = await this.callGameAPI(gameId);
            
            // Cache the result for 5 minutes
            cache.set(cacheKey, gameData, 300000); // 5 minutes in milliseconds
            
            metrics.trackApiCall('WOS_API', Date.now(), true, false);
            return gameData;

        } catch (error) {
            metrics.trackApiCall('WOS_API', Date.now(), false, false);
            if (error instanceof ValidationError || error instanceof APIError) {
                throw error;
            }
            throw new APIError(`Failed to fetch game data for FID ${gameId}`, 'WOS_API', error);
        }
    }

    /**
     * Calls the Whiteout Survival game API
     * @param {string} gameId - Player's game ID
     * @returns {Promise<Object>} API response data
     */
    async callGameAPI(gameId) {
        if (!this.apiSecret) {
            throw new APIError('WOS API secret not configured', 'WOS_API');
        }

        const currentTime = Date.now();
        const baseForm = `fid=${gameId}&time=${currentTime}`;
        const sign = crypto.createHash('md5').update(baseForm + this.apiSecret).digest('hex');
        const fullForm = `sign=${sign}&${baseForm}`;

        try {
            const response = await axios.post(this.apiEndpoint, fullForm, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10000 // 10 second timeout
            });

            const data = response.data;

            if (data.code !== 0 || !data.data || !data.data.nickname) {
                throw new APIError(data.msg || 'API returned an unexpected response or error code', 'WOS_API');
            }

            return {
                nickname: data.data.nickname,
                stove_lv: data.data.stove_lv,
                avatar_image: data.data.avatar_image,
                fid: data.data.fid
            };

        } catch (error) {
            if (error.response) {
                throw new APIError(`API request failed: ${error.response.status}`, 'WOS_API', error);
            }
            throw new APIError('Network error occurred', 'WOS_API', error);
        }
    }

    /**
     * Formats furnace level for display
     * @param {number} stoveLevel - Stove level from API
     * @returns {string} Formatted level string
     */
    formatFurnaceLevel(stoveLevel) {
        if (stoveLevel > this.baseFurnaceLevel) {
            return this.levelMapping[stoveLevel] || `FC Level ${stoveLevel}`;
        }
        return `Level ${stoveLevel}`;
    }

    /**
     * Gets comprehensive player information
     * @param {Object} userData - Database user data
     * @param {Object} gameData - Game API data
     * @param {Object} discordUser - Discord user object
     * @returns {Object} Formatted player information
     */
    getPlayerInfo(userData, gameData, discordUser) {
        return {
            discordUser: {
                id: discordUser.id,
                tag: discordUser.tag,
                avatar: discordUser.displayAvatarURL()
            },
            game: {
                fid: userData.gameId,
                nickname: gameData.nickname,
                stoveLevel: gameData.stove_lv,
                furnaceLevel: this.formatFurnaceLevel(gameData.stove_lv),
                avatarImage: gameData.avatar_image
            },
            database: {
                verified: userData.verified,
                nickname: userData.nickname
            }
        };
    }
}

module.exports = PlayerInfoService;
