/**
 * Discord API Optimization Utilities
 * Provides batch operations and optimized Discord API usage patterns
 */

class DiscordOptimizer {
    constructor() {
        this.memberCache = new Map();
        this.channelCache = new Map();
        this.guildCache = new Map();
        this.batchSize = 50; // Discord API batch limit
        this.cacheTimeout = 300000; // 5 minutes
    }

    /**
     * Batch fetches multiple members efficiently
     * @param {Guild} guild - Discord guild
     * @param {Array<string>} userIds - Array of user IDs to fetch
     * @param {boolean} force - Force refresh from Discord API
     * @returns {Promise<Map>} Map of user ID to member
     */
    async batchFetchMembers(guild, userIds, force = false) {
        const results = new Map();
        const uncachedIds = [];

        // Check cache first
        if (!force) {
            for (const userId of userIds) {
                const cacheKey = `${guild.id}_${userId}`;
                const cached = this.memberCache.get(cacheKey);
                
                if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                    results.set(userId, cached.member);
                } else {
                    uncachedIds.push(userId);
                }
            }
        } else {
            uncachedIds.push(...userIds);
        }

        // Batch fetch uncached members
        if (uncachedIds.length > 0) {
            try {
                const fetchedMembers = await guild.members.fetch({ 
                    user: uncachedIds, 
                    force: force 
                });
                
                // Cache results
                for (const [userId, member] of fetchedMembers) {
                    const cacheKey = `${guild.id}_${userId}`;
                    this.memberCache.set(cacheKey, {
                        member,
                        timestamp: Date.now()
                    });
                    results.set(userId, member);
                }
            } catch (error) {
                console.warn(`[Discord Optimizer] Failed to batch fetch members:`, error.message);
                
                // Fallback to individual fetches
                for (const userId of uncachedIds) {
                    try {
                        const member = await guild.members.fetch({ user: userId, force: force });
                        const cacheKey = `${guild.id}_${userId}`;
                        this.memberCache.set(cacheKey, {
                            member,
                            timestamp: Date.now()
                        });
                        results.set(userId, member);
                    } catch (memberError) {
                        console.warn(`[Discord Optimizer] Failed to fetch member ${userId}:`, memberError.message);
                    }
                }
            }
        }

        return results;
    }

    /**
     * Batch fetches multiple channels efficiently
     * @param {Guild} guild - Discord guild
     * @param {Array<string>} channelIds - Array of channel IDs to fetch
     * @returns {Promise<Map>} Map of channel ID to channel
     */
    async batchFetchChannels(guild, channelIds) {
        const results = new Map();
        const uncachedIds = [];

        // Check cache first
        for (const channelId of channelIds) {
            const cacheKey = `${guild.id}_${channelId}`;
            const cached = this.channelCache.get(cacheKey);
            
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                results.set(channelId, cached.channel);
            } else {
                uncachedIds.push(channelId);
            }
        }

        // Fetch uncached channels
        for (const channelId of uncachedIds) {
            try {
                const channel = await guild.channels.fetch(channelId);
                const cacheKey = `${guild.id}_${channelId}`;
                this.channelCache.set(cacheKey, {
                    channel,
                    timestamp: Date.now()
                });
                results.set(channelId, channel);
            } catch (error) {
                console.warn(`[Discord Optimizer] Failed to fetch channel ${channelId}:`, error.message);
            }
        }

        return results;
    }

    /**
     * Optimized nickname updates with batching and rate limiting
     * @param {Guild} guild - Discord guild
     * @param {Array<Object>} updates - Array of {userId, nickname} objects
     * @returns {Promise<Array>} Results of nickname updates
     */
    async batchUpdateNicknames(guild, updates) {
        const results = [];
        const batches = this.chunkArray(updates, this.batchSize);

        for (const batch of batches) {
            const batchPromises = batch.map(async ({ userId, nickname }) => {
                try {
                    const member = await guild.members.fetch({ user: userId, force: false });
                    if (member.nickname !== nickname) {
                        await member.setNickname(nickname, 'Automated Nickname Sync');
                        return { success: true, userId, nickname };
                    }
                    return { success: true, userId, nickname, reason: 'No change needed' };
                } catch (error) {
                    return { success: false, userId, nickname, error: error.message };
                }
            });

            const batchResults = await Promise.allSettled(batchPromises);
            results.push(...batchResults.map(result => 
                result.status === 'fulfilled' ? result.value : { success: false, error: result.reason }
            ));

            // Rate limiting delay between batches
            if (batches.indexOf(batch) < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        return results;
    }

    /**
     * Optimized role management with batching
     * @param {GuildMember} member - Discord member
     * @param {Array<string>} roleIds - Array of role IDs to add/remove
     * @param {string} action - 'add' or 'remove'
     * @returns {Promise<Object>} Result of role operation
     */
    async batchRoleOperation(member, roleIds, action = 'add') {
        try {
            const roles = await Promise.all(
                roleIds.map(roleId => member.guild.roles.fetch(roleId))
            );

            const validRoles = roles.filter(role => role !== null);
            
            if (action === 'add') {
                await member.roles.add(validRoles, 'Batch role assignment');
            } else {
                await member.roles.remove(validRoles, 'Batch role removal');
            }

            return { success: true, rolesProcessed: validRoles.length };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Clears expired cache entries
     */
    cleanupCache() {
        const now = Date.now();
        let cleanedCount = 0;

        // Clean member cache
        for (const [key, data] of this.memberCache.entries()) {
            if (now - data.timestamp > this.cacheTimeout) {
                this.memberCache.delete(key);
                cleanedCount++;
            }
        }

        // Clean channel cache
        for (const [key, data] of this.channelCache.entries()) {
            if (now - data.timestamp > this.cacheTimeout) {
                this.channelCache.delete(key);
                cleanedCount++;
            }
        }

        // Clean guild cache
        for (const [key, data] of this.guildCache.entries()) {
            if (now - data.timestamp > this.cacheTimeout) {
                this.guildCache.delete(key);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            console.log(`[Discord Optimizer] Cleaned up ${cleanedCount} expired cache entries`);
        }
    }

    /**
     * Gets cache statistics
     * @returns {Object} Cache statistics
     */
    getCacheStats() {
        return {
            memberCache: this.memberCache.size,
            channelCache: this.channelCache.size,
            guildCache: this.guildCache.size,
            totalCacheEntries: this.memberCache.size + this.channelCache.size + this.guildCache.size
        };
    }

    /**
     * Utility function to chunk array into smaller arrays
     * @param {Array} array - Array to chunk
     * @param {number} size - Chunk size
     * @returns {Array} Array of chunks
     */
    chunkArray(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}

// Create singleton instance
const discordOptimizer = new DiscordOptimizer();

// Start cleanup timer
setInterval(() => {
    discordOptimizer.cleanupCache();
}, 300000); // Clean every 5 minutes

module.exports = {
    DiscordOptimizer,
    discordOptimizer
};
