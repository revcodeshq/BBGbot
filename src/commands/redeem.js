const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const GiftCodeRedemptionService = require('../services/gift-code-service');
const User = require('../database/models.User');
const { validateGiftCode, sanitizeInput } = require('../utils/validators');
const { ValidationError, APIError } = require('../utils/error-handler');
const { ErrorHandler } = require('../utils/error-handler');
const { metrics } = require('../utils/metrics');
const logger = require('../utils/logger');
const { brandingText } = require('../utils/branding');

module.exports = {
    data: new SlashCommandBuilder()
    .setName('redeem')
        .setDescription('Redeem a gift code for ALL registered FIDs (using MongoDB data)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('code')
                .setDescription('Gift code to redeem')
                .setRequired(true)
                .setMaxLength(20)
                .setMinLength(4)
        ),

    async execute(interaction) {
        const startTime = Date.now();
        console.log('[DEBUG] redeem_batch execute called by', interaction.user?.tag, 'in guild', interaction.guild?.id);
        try {
            // Track command usage
            metrics.trackCommand('redeem_batch', interaction.user.id, 0, true);

            // Validate input
            const code = sanitizeInput(interaction.options.getString('code'));
            if (!validateGiftCode(code)) {
                throw new ValidationError('Invalid gift code format. Code must be 4-20 alphanumeric characters.', 'code');
            }

            // Initialize service
            const redemptionService = new GiftCodeRedemptionService();
            const initiatorTag = interaction.user.tag;

            // ...existing code...
            let statusMessage = `🎁 Starting batch redemption for code **${code}**...`;
            await interaction.editReply(statusMessage);

            // Fetch users from database
            const users = await User.find({ 
                gameId: { $ne: null },
                verified: true 
            }).select('gameId discordId nickname').lean();

            if (users.length === 0) {
                await interaction.editReply({ 
                    content: '⚠️ Found 0 verified FIDs in the database. Redemption aborted.' 
                });
                return;
            }

            statusMessage += `\n📊 Found **${users.length}** verified FIDs to process.`;
            await interaction.editReply(statusMessage);

            // Format users for processing
            const usersToRedeem = users.map(user => ({
                fid: user.gameId,
                discordId: user.discordId,
                nickname: user.nickname || 'Unknown Player'
            }));

            // Process batch redemption with live progress
            statusMessage += `\n🔄 Processing redemptions...`;
            await interaction.editReply(statusMessage);

            let progressEmbed = null;
            let lastProgress = { success: 0, skipped: 0, failed: 0, processed: 0 };
            const redemptionResults = [];

            // Progress callback for live updates
            const progressCallback = async (processed, total) => {
                // Count current results
                const success = redemptionResults.filter(r => r.status === 'SUCCESS').length;
                const skipped = redemptionResults.filter(r => r.status === 'SKIPPED').length;
                const failed = redemptionResults.filter(r => r.status === 'FAILED').length;
                // Only update if progress changed
                if (processed !== lastProgress.processed) {
                    lastProgress = { success, skipped, failed, processed };
                    // Progress bar
                    const percent = Math.round((processed / total) * 100);
                    const barLen = 20;
                    const filledLen = Math.round(barLen * percent / 100);
                    const bar = '█'.repeat(filledLen) + '░'.repeat(barLen - filledLen);
                    progressEmbed = new EmbedBuilder()
                        .setTitle(`🎁 Batch Redemption Progress`)
                        .setDescription(`Code: **${code}**\nProcessed: **${processed}/${total}**\nProgress: [${bar}] **${percent}%**`)
                        .setColor(0x3498db)
                        .addFields(
                            { name: '✅ Success', value: `${success}`, inline: true },
                            { name: '🟡 Skipped', value: `${skipped}`, inline: true },
                            { name: '❌ Failed', value: `${failed}`, inline: true }
                        )
                        .setTimestamp();
                    await interaction.editReply({ content: '⏳ Batch redemption in progress...', embeds: [progressEmbed] });
                }
            };

            // Custom batch processor to collect results and update progress
            const batchResults = await redemptionService.processBatchRedemption(
                usersToRedeem,
                code,
                async (processed, total) => {
                    // Only update every 5 users or on completion
                    if (processed % 5 === 0 || processed === total) {
                        await progressCallback(processed, total);
                    }
                }
            );
            batchResults.forEach(r => {
                r.initiatorTag = initiatorTag;
                redemptionResults.push(r);
            });

            // Track metrics
            const successCount = redemptionResults.filter(r => r.status === 'SUCCESS').length;
            const skippedCount = redemptionResults.filter(r => r.status === 'SKIPPED').length;
            const failedCount = redemptionResults.filter(r => r.status === 'FAILED').length;

            metrics.trackApiCall('WOS_API', Date.now() - startTime, successCount > 0);

            // Log activity
            const logDetails = `Code: \`${code}\`\nTotal Users: ${users.length}\nSuccessful: ${successCount}\nSkipped: ${skippedCount}\nFailed: ${failedCount}`;
            await logger.logBotActivity('Gift Code Batch Redemption', logDetails, interaction);

            // Create results embed
            const resultsEmbed = this.createResultsEmbed(code, users.length, redemptionResults);

            // Send final results
            await interaction.editReply({ 
                content: '✅ Batch redemption completed! See results below.',
                embeds: [resultsEmbed]
            });

        } catch (error) {
            const executionTime = Date.now() - startTime;
            metrics.trackCommand('redeem_batch', interaction.user.id, executionTime, false);
            metrics.trackError(error, 'redeem_batch');

            const errorResponse = ErrorHandler.handleError(error, {
                interaction,
                user: interaction.user,
                guild: interaction.guild,
                channel: interaction.channel,
                command: 'redeem_batch'
            });

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: errorResponse.userMessage,
                    flags: 64
                });
            } else {
                await interaction.editReply({
                    content: errorResponse.userMessage
                });
            }

            // Log error
            const logDetails = `Code: \`${interaction.options.getString('code')}\`\nError: ${error.message}`;
            await logger.logBotActivity('Gift Code Redemption Error', logDetails, interaction);
        }
    },

    /**
     * Creates a results embed for redemption results
     * @param {string} code - Gift code used
     * @param {number} totalUsers - Total users processed
     * @param {Array} results - Redemption results
     * @returns {EmbedBuilder} Results embed
     */
    createResultsEmbed(code, totalUsers, results) {
        const success = results.filter(r => r.status === 'SUCCESS');
        const skipped = results.filter(r => r.status === 'SKIPPED');
        const failed = results.filter(r => r.status === 'FAILED');

        const MAX_DISPLAY_COUNT = 15;

        const formatList = (arr) => {
            let list = arr.slice(0, MAX_DISPLAY_COUNT)
                .map(r => `• **${r.nickname}** (\`${r.fid}\`)`)
                .join('\n');
            
            if (arr.length > MAX_DISPLAY_COUNT) {
                list += `\n*...and ${arr.length - MAX_DISPLAY_COUNT} more*`;
            }
            return list || '*(None)*';
        };

        const embed = new EmbedBuilder()
            .setTitle(`🎉 Batch Redemption Report: ${code}`)
            .setDescription(`Processed **${totalUsers}** verified FIDs.`)
            .setColor(failed.length > 0 ? 0xff0000 : (success.length > 0 ? 0x00ff00 : 0xffa500))
            .setThumbnail('https://i.imgur.com/G5X6mP7.png')
            .addFields(
                {
                    name: `✅ Successful Redemptions (${success.length})`,
                    value: formatList(success),
                    inline: true,
                },
                {
                    name: `🟡 Already Redeemed (${skipped.length})`,
                    value: formatList(skipped),
                    inline: true,
                },
                {
                    name: '\u200B',
                    value: '\u200B',
                    inline: false,
                }
            )
            .setTimestamp()
            .setFooter({ text: `Batch run initiated by ${results[0]?.initiatorTag || 'Bot'} | ${brandingText}` });

        if (failed.length > 0) {
            embed.addFields({
                name: `❌ Failures (${failed.length})`,
                value: failed.map(r => `• **${r.nickname}**: ${r.msg.replace('FAILED: ', '')}`).join('\n').substring(0, 1024),
                inline: false,
            });
        }

        return embed;
    }
};
