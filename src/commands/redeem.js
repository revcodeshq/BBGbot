const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const GiftCodeRedemptionService = require('../services/gift-code-service');
const User = require('../database/models.User');
const { validateGiftCode, sanitizeInput } = require('../utils/validators');
const { ValidationError } = require('../utils/error-handler');
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
        
        // Create a message that we'll use for updates
        let progressMessage = null;
        
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
            const usersToRedeemRaw = users.map(user => ({
                fid: user.gameId,
                discordId: user.discordId,
                nickname: user.nickname || 'Unknown Player'
            }));

            // Pre-filter users who already redeemed this code
            const { filterAlreadyRedeemed } = require('../database/filterAlreadyRedeemed');
            const usersToRedeem = await filterAlreadyRedeemed(usersToRedeemRaw, code);

            statusMessage += `\n🔄 Processing redemptions...`;
            statusMessage += `\n⏩ Skipping ${usersToRedeemRaw.length - usersToRedeem.length} users who already redeemed.`;
            await interaction.editReply(statusMessage);

            let progressEmbed = null;
            const redemptionResults = [];

            // Custom batch processor to collect results and update progress in real time
            const startTime = Date.now();
            await redemptionService.processBatchRedemption(
                usersToRedeem,
                code,
                async (processed, total, result) => {
                    // Add result as soon as it's processed
                    if (result) {
                        result.initiatorTag = initiatorTag;
                        redemptionResults.push(result);
                    }
                    
                    // Update progress more frequently (every user now)
                    const elapsed = Date.now() - startTime;
                    const avgTimePerUser = processed > 0 ? elapsed / processed : 0;
                    const remaining = total - processed;
                    const eta = remaining * avgTimePerUser;
                    
                    const success = redemptionResults.filter(r => r.status === 'SUCCESS').length;
                    const skipped = redemptionResults.filter(r => r.status === 'SKIPPED').length;
                    const failed = redemptionResults.filter(r => r.status === 'FAILED').length;
                    
                    // Progress bar
                    const percent = Math.round((processed / total) * 100);
                    const barLen = 20;
                    const filledLen = Math.round(barLen * percent / 100);
                    const bar = '█'.repeat(filledLen) + '░'.repeat(barLen - filledLen);
                    
                    const etaText = eta > 0 ? ` | ETA: ${Math.round(eta / 1000)}s` : '';
                    
                    progressEmbed = new EmbedBuilder()
                        .setTitle(`🎁 Batch Redemption Progress`)
                        .setDescription(`Code: **${code}**\nProcessed: **${processed}/${total}** (${percent}%)\nProgress: [${bar}]${etaText}`)
                        .setColor(percent < 30 ? 0xff6b6b : percent < 70 ? 0xffa726 : 0x66bb6a)
                        .addFields(
                            { name: '✅ Success', value: `${success}`, inline: true },
                            { name: '🟡 Skipped', value: `${skipped}`, inline: true },
                            { name: '❌ Failed', value: `${failed}`, inline: true }
                        )
                        .setTimestamp();
                    
                    await interaction.editReply({ 
                        content: `⏳ Batch redemption in progress... (${percent}% complete)`, 
                        embeds: [progressEmbed] 
                    });
                }
            );

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
            // Categorize failures for better reporting
            const rateLimitErrors = failed.filter(r => 
                r.msg.includes('CAPTCHA CHECK TOO FREQUENT') || 
                r.msg.includes('CAPTCHA CHECK ERROR') ||
                r.apiError?.err_code === 40103
            );
            const authErrors = failed.filter(r => 
                r.msg.includes('NOT LOGIN') || 
                r.msg.includes('CAPTCHA generation failed') ||
                r.apiError?.err_code === 40001
            );
            const otherErrors = failed.filter(r => 
                !rateLimitErrors.includes(r) && !authErrors.includes(r)
            );

            let failureText = '';
            if (rateLimitErrors.length > 0) {
                failureText += `**Rate Limited (${rateLimitErrors.length}):**\n`;
                failureText += rateLimitErrors.slice(0, 5).map(r => 
                    `• **${r.nickname}**: CAPTCHA rate limit`
                ).join('\n') + '\n\n';
            }
            if (authErrors.length > 0) {
                failureText += `**Auth/Login Issues (${authErrors.length}):**\n`;
                failureText += authErrors.slice(0, 5).map(r => 
                    `• **${r.nickname}**: Authentication failed`
                ).join('\n') + '\n\n';
            }
            if (otherErrors.length > 0) {
                failureText += `**Other Errors (${otherErrors.length}):**\n`;
                failureText += otherErrors.slice(0, 5).map(r => {
                    const msg = `• **${r.nickname}**: ${r.msg.replace('FAILED: ', '')}`;
                    return msg;
                }).join('\n');
            }

            embed.addFields({
                name: `❌ Failures (${failed.length})`,
                value: failureText.substring(0, 1024),
                inline: false,
            });
        }

        return embed;
    }
};
