const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { metrics } = require('../utils/metrics');
const { performanceMonitor } = require('../utils/performance-monitor');
const { advancedCache } = require('../utils/advanced-cache');
const { smartRateLimiter } = require('../utils/smart-rate-limiter');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('metrics')
        .setDescription('Display advanced bot performance metrics and health status')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of metrics to display')
                .setRequired(false)
                .addChoices(
                    { name: '📊 Basic Metrics', value: 'basic' },
                    { name: '🚀 Performance Dashboard', value: 'performance' },
                    { name: '💾 Cache Statistics', value: 'cache' },
                    { name: '⚡ Rate Limiting', value: 'rate_limit' },
                    { name: '🔍 All Metrics', value: 'all' }
                )),

    async execute(interaction) {
        try {
            const metricsType = interaction.options.getString('type') || 'basic';
            let embed;

            switch (metricsType) {
                case 'performance':
                    embed = performanceMonitor.createPerformanceDashboard(interaction.client);
                    break;
                case 'cache':
                    embed = this.createCacheMetricsEmbed();
                    break;
                case 'rate_limit':
                    embed = this.createRateLimitMetricsEmbed();
                    break;
                case 'all':
                    embed = this.createAllMetricsEmbed(interaction.client);
                    break;
                default:
                    embed = metrics.createMetricsEmbed(interaction.client);
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in metrics command:', error);
            try {
                await interaction.editReply({
                    content: '❌ An error occurred while fetching metrics.'
                });
            } catch (replyError) {
                console.error('Failed to send error response:', replyError.message);
            }
        }
    },

    createCacheMetricsEmbed() {
        const stats = advancedCache.getStats();
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setTitle('💾 Advanced Cache Statistics')
            .setColor(0x00ff00)
            .setTimestamp()
            .addFields(
                {
                    name: '📊 Cache Overview',
                    value: `Total Entries: ${stats.totalSize}\nHit Rate: ${stats.hitRate.toFixed(1)}%`,
                    inline: true
                }
            );

        // Add tier statistics
        for (const [tier, tierStats] of Object.entries(stats.tiers)) {
            embed.addFields({
                name: `🔥 ${tier.toUpperCase()} Cache`,
                value: `Size: ${tierStats.size}/${tierStats.maxSize}\nUtilization: ${tierStats.utilization.toFixed(1)}%`,
                inline: true
            });
        }

        // Add eviction stats
        if (Object.keys(stats.evictionStats).length > 0) {
            const evictionText = Object.entries(stats.evictionStats)
                .map(([tier, evictionStats]) => `${tier}: ${evictionStats.totalEvictions} evictions`)
                .join('\n');
            
            embed.addFields({
                name: '🗑️ Eviction Statistics',
                value: evictionText,
                inline: false
            });
        }

        return embed;
    },

    createRateLimitMetricsEmbed() {
        const stats = smartRateLimiter.getStats();
        const { EmbedBuilder } = require('discord.js');
        
        const embed = new EmbedBuilder()
            .setTitle('⚡ Smart Rate Limiting Statistics')
            .setColor(0x00ff00)
            .setTimestamp()
            .addFields(
                {
                    name: '📊 Rate Limiting Overview',
                    value: `Active Limiters: ${stats.activeLimiters}\nTotal Requests: ${stats.totalRequests}\nAdaptive Configs: ${stats.adaptiveConfigs}`,
                    inline: true
                },
                {
                    name: '📈 Performance',
                    value: `Avg Requests/Limiter: ${stats.averageRequestsPerLimiter.toFixed(1)}\nTotal Limiters: ${stats.totalLimiters}`,
                    inline: true
                }
            );

        return embed;
    },

    createAllMetricsEmbed(client) {
        const basicEmbed = metrics.createMetricsEmbed(client);
        const performanceStats = performanceMonitor.getPerformanceStats();
        const cacheStats = advancedCache.getStats();
        const rateLimitStats = smartRateLimiter.getStats();
        
        basicEmbed.setTitle('🔍 Complete Bot Analytics Dashboard');
        
        // Add performance data
        basicEmbed.addFields(
            {
                name: '🚀 Performance Monitor',
                value: `Memory Trend: ${performanceStats.memory.trend}\nCPU Usage: ${performanceStats.cpu.current}ms\nRecent Alerts: ${performanceStats.alerts.length}`,
                inline: true
            },
            {
                name: '💾 Cache Performance',
                value: `Hit Rate: ${cacheStats.hitRate.toFixed(1)}%\nTotal Entries: ${cacheStats.totalSize}\nTiers: ${Object.keys(cacheStats.tiers).length}`,
                inline: true
            },
            {
                name: '⚡ Rate Limiting',
                value: `Active Limiters: ${rateLimitStats.activeLimiters}\nTotal Requests: ${rateLimitStats.totalRequests}\nAdaptive Configs: ${rateLimitStats.adaptiveConfigs}`,
                inline: true
            }
        );

        return basicEmbed;
    }
};
