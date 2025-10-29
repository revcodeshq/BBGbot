const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { ErrorHandler } = require('../utils/error-handler');
const { metrics } = require('../utils/metrics');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('changelog')
        .setDescription('📋 View recent updates and improvements to the bot')
        .addStringOption(option =>
            option.setName('version')
                .setDescription('View changelog for a specific version')
                .setRequired(false)
                .addChoices(
                    { name: 'Latest (v1.0.0)', value: '1.0.0' },
                    { name: 'Previous (v0.9.0)', value: '0.9.0' },
                    { name: 'All Versions', value: 'all' }
                )
        ),

    async execute(interaction) {
        try {
            const version = interaction.options.getString('version') || 'latest';

            if (version === 'all') {
                await this.showFullChangelog(interaction);
            } else {
                await this.showVersionChangelog(interaction, version);
            }

            // Track changelog command usage
            metrics.trackCommand('changelog', interaction.user.id, 0, true);

        } catch (error) {
            console.error('Error in changelog command:', error);
            const errorResponse = ErrorHandler.handleError(error, {
                interaction,
                user: interaction.user,
                guild: interaction.guild,
                channel: interaction.channel,
                command: 'changelog'
            });

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: errorResponse.userMessage, ephemeral: true });
            } else {
                await interaction.editReply({ content: errorResponse.userMessage });
            }

            await logger.logBotActivity('Changelog Command Error', error.message, interaction);
        }
    },

    async showVersionChangelog(interaction, version) {
        const changelogData = this.getChangelogData(version);

        if (!changelogData) {
            await interaction.editReply({
                content: `❌ Changelog for version ${version} not found.`,
                ephemeral: true
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(this.getVersionColor(version))
            .setTitle(`📋 BBG Bot Changelog - v${version}`)
            .setDescription(changelogData.description)
            .setTimestamp()
            .setFooter({ text: 'BBG Bot • Changelog System' });

        // Add changelog entries
        changelogData.entries.forEach(entry => {
            embed.addFields({
                name: `${entry.emoji} ${entry.title}`,
                value: entry.description,
                inline: false
            });
        });

        // Add metadata
        embed.addFields({
            name: '📅 Release Info',
            value: `**Date:** ${changelogData.releaseDate}\n**Type:** ${changelogData.releaseType}`,
            inline: true
        });

        // Navigation buttons
        const components = this.createNavigationButtons(version);

        await interaction.editReply({
            embeds: [embed],
            components: [components]
        });
    },

    async showFullChangelog(interaction) {
        const allVersions = ['1.0.0', '0.9.0'];

        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('📋 Complete BBG Bot Changelog')
            .setDescription('All versions and updates in chronological order')
            .setTimestamp()
            .setFooter({ text: 'BBG Bot • Changelog System' });

        // Add version summaries
        allVersions.forEach(version => {
            const data = this.getChangelogData(version);
            if (data) {
                embed.addFields({
                    name: `v${version} - ${data.releaseDate}`,
                    value: `${data.releaseType}\n${data.description}`,
                    inline: false
                });
            }
        });

        // Quick navigation buttons
        const components = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('changelog_latest')
                    .setLabel('📋 Latest Version')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('changelog_all_features')
                    .setLabel('🎯 All Features')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('changelog_close')
                    .setLabel('❌ Close')
                    .setStyle(ButtonStyle.Danger)
            );

        await interaction.editReply({
            embeds: [embed],
            components: [components]
        });
    },

    getChangelogData(version) {
        const changelogs = {
            '1.0.0': {
                description: '🎉 **Major Release**: Complete architecture overhaul with advanced features and professional-grade improvements.',
                releaseDate: 'December 2024',
                releaseType: 'Major Release',
                entries: [
                    {
                        emoji: '🏗️',
                        title: 'Architecture Overhaul',
                        description: 'Complete modular architecture with handlers, services, and utilities. Improved maintainability and scalability.'
                    },
                    {
                        emoji: '🛡️',
                        title: 'Advanced Security',
                        description: 'Comprehensive input validation, sanitization, and XSS prevention. Enhanced permission systems.'
                    },
                    {
                        emoji: '⚡',
                        title: 'Performance Optimization',
                        description: 'Intelligent caching, batch processing, rate limiting, and circuit breakers for optimal performance.'
                    },
                    {
                        emoji: '📊',
                        title: 'Advanced Monitoring',
                        description: 'Real-time metrics dashboard, error tracking, and comprehensive logging system.'
                    },
                    {
                        emoji: '🔧',
                        title: 'Code Quality Tools',
                        description: 'ESLint and Prettier integration for consistent code formatting and quality.'
                    },
                    {
                        emoji: '🧪',
                        title: 'Testing Framework',
                        description: 'Jest testing framework with unit tests for utilities and validation functions.'
                    },
                    {
                        emoji: '📝',
                        title: 'User Feedback System',
                        description: 'Interactive feedback command for bug reports, feature requests, and general feedback.'
                    },
                    {
                        emoji: '🎯',
                        title: 'Enhanced Commands',
                        description: 'Improved help system, advanced metrics, and better user experience across all commands.'
                    }
                ]
            },
            '0.9.0': {
                description: '🚀 **Feature Release**: Core functionality with game integration and community features.',
                releaseDate: 'November 2024',
                releaseType: 'Feature Release',
                entries: [
                    {
                        emoji: '🎮',
                        title: 'Game Integration',
                        description: 'Whiteout Survival integration with player verification, stats, and code redemption.'
                    },
                    {
                        emoji: '📅',
                        title: 'Scheduling System',
                        description: 'Advanced announcement scheduling with multiple intervals and timezone support.'
                    },
                    {
                        emoji: '🎉',
                        title: 'Community Features',
                        description: 'Giveaways, polls, quotes, and interactive community engagement tools.'
                    },
                    {
                        emoji: '🤖',
                        title: 'AI Features',
                        description: 'Google Gemini integration for translation and AI-powered guide assistance.'
                    },
                    {
                        emoji: '⚙️',
                        title: 'Admin Tools',
                        description: 'Comprehensive admin commands for server management and bot control.'
                    },
                    {
                        emoji: '🐳',
                        title: 'Docker Support',
                        description: 'Containerization with Docker and Docker Compose for easy deployment.'
                    }
                ]
            }
        };

        return changelogs[version];
    },

    getVersionColor(version) {
        const colors = {
            '1.0.0': 0x00ff00, // Green for major release
            '0.9.0': 0x0099ff  // Blue for feature release
        };
        return colors[version] || 0x00ff00;
    },

    createNavigationButtons(currentVersion) {
        const components = new ActionRowBuilder();

        // Previous version button
        if (currentVersion !== '0.9.0') {
            components.addComponents(
                new ButtonBuilder()
                    .setCustomId('changelog_prev')
                    .setLabel('⬅️ Previous')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        // Latest version button
        if (currentVersion !== '1.0.0') {
            components.addComponents(
                new ButtonBuilder()
                    .setCustomId('changelog_latest')
                    .setLabel('📋 Latest')
                    .setStyle(ButtonStyle.Primary)
            );
        }

        // All versions button
        components.addComponents(
            new ButtonBuilder()
                .setCustomId('changelog_all')
                .setLabel('📚 All Versions')
                .setStyle(ButtonStyle.Secondary)
        );

        // Close button
        components.addComponents(
            new ButtonBuilder()
                .setCustomId('changelog_close')
                .setLabel('❌ Close')
                .setStyle(ButtonStyle.Danger)
        );

        return components;
    },

    /**
     * Handles changelog button interactions
     * @param {Object} interaction - Button interaction
     */
    async handleChangelogButton(interaction) {
        try {
            const { customId } = interaction;

            switch (customId) {
                case 'changelog_latest':
                    await this.showVersionChangelog(interaction, '1.0.0');
                    break;
                case 'changelog_prev':
                    await this.showVersionChangelog(interaction, '0.9.0');
                    break;
                case 'changelog_all':
                    await this.showFullChangelog(interaction);
                    break;
                case 'changelog_all_features':
                    await this.showFeaturesOverview(interaction);
                    break;
                case 'changelog_close':
                    await interaction.update({
                        content: '👋 Changelog closed. Use `/changelog` to open it again!',
                        embeds: [],
                        components: []
                    });
                    break;
                default:
                    await interaction.followUp({
                        content: '❌ Unknown changelog action.',
                        ephemeral: true
                    });
            }
        } catch (error) {
            console.error('Error handling changelog button:', error);
            await interaction.followUp({
                content: '❌ An error occurred while processing the changelog request.',
                ephemeral: true
            });
        }
    },

    async showFeaturesOverview(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle('🎯 BBG Bot Feature Overview')
            .setDescription('Complete list of features and capabilities')
            .addFields(
                {
                    name: '🎮 Game Integration',
                    value: '• Player verification & stats\n• Code redemption\n• Schedule tracking\n• Nickname sync',
                    inline: true
                },
                {
                    name: '⚙️ Utilities',
                    value: '• Interactive help system\n• Performance metrics\n• User feedback\n• Changelog access',
                    inline: true
                },
                {
                    name: '🎉 Community',
                    value: '• Giveaways & polls\n• Quotes & timers\n• Rally coordination\n• Fun commands',
                    inline: true
                },
                {
                    name: '🤖 AI Features',
                    value: '• Multi-language translation\n• AI-powered guides\n• Intent detection\n• Smart responses',
                    inline: true
                },
                {
                    name: '🛡️ Security',
                    value: '• Input validation\n• XSS prevention\n• Rate limiting\n• Audit logging',
                    inline: true
                },
                {
                    name: '📊 Monitoring',
                    value: '• Real-time metrics\n• Error tracking\n• Performance monitoring\n• Health checks',
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({ text: 'BBG Bot • Feature Overview' });

        await interaction.update({
            embeds: [embed],
            components: [this.createNavigationButtons('features')]
        });
    }
};