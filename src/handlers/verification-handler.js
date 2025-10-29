/**
 * Verification Handler
 * Handles all verification-related interactions (buttons, modals)
 */

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const User = require('../database/models.User');
const { getFurnaceLevelName } = require('../utils/game-utils');
const { get } = require('../utils/config');
const { brandingText } = require('../utils/branding');
const logger = require('../utils/logger');
const { validateFID, sanitizeInput } = require('../utils/validators');
const { apiCache } = require('../utils/cache');
const { APIError, ValidationError } = require('../utils/error-handler');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

class VerificationHandler {
    /**
     * Handles the start verification button click
     * @param {Object} interaction - Discord interaction object
     */
    static async handleStartVerification(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('verify_modal')
            .setTitle('Alliance Verification');

        const fidInput = new TextInputBuilder()
            .setCustomId('fid_input')
            .setLabel('Paste your Whiteout Survival FID')
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('e.g. 123456789')
            .setRequired(true)
            .setMaxLength(15)
            .setMinLength(6);

        modal.addComponents(new ActionRowBuilder().addComponents(fidInput));
        await interaction.showModal(modal);
    }

    /**
     * Handles verification modal submission
     * @param {Object} interaction - Discord interaction object
     */
    static async handleVerificationModal(interaction) {
        const fid = sanitizeInput(interaction.fields.getTextInputValue('fid_input'));
        
        // Validate FID format
        if (!validateFID(fid)) {
            throw new ValidationError('FID must be between 6 and 15 digits.', 'fid');
        }

        // Check if user is already verified
        const existing = await User.findOne({ discordId: interaction.user.id, verified: true });
        if (existing) {
            return interaction.reply({ 
                content: '✅ You are already verified!', 
                flags: 64 
            });
        }

        try {
            // Fetch player data from API with caching
            const player = await apiCache.getPlayerData(fid, async () => {
                return await this.fetchPlayerData(fid);
            });

            if (!player || !player.nickname) {
                throw new APIError('No player found for this FID!', 'WOS_API');
            }

            const furnaceLevelName = getFurnaceLevelName(player.stove_lv);

            // Save user data
            await User.findOneAndUpdate(
                { discordId: interaction.user.id },
                { 
                    discordId: interaction.user.id, 
                    gameId: fid, 
                    nickname: sanitizeInput(player.nickname), 
                    furnaceLevel: furnaceLevelName, 
                    verified: false, 
                    roles: [],
                    avatar_image: player.avatar_image
                },
                { upsert: true, new: true }
            );

            // Send verification request to leaders
            await this.sendVerificationRequest(interaction, {
                fid,
                nickname: player.nickname,
                furnaceLevel: furnaceLevelName,
                avatar_image: player.avatar_image
            });

            // Log verification attempt
            logger.logVerification(interaction.user, { 
                fid, 
                nickname: player.nickname, 
                furnaceLevel: furnaceLevelName 
            });

            await interaction.reply({ 
                content: '✅ Verification request submitted! Leaders will review and approve you soon.', 
                flags: 64 
            });

        } catch (error) {
            if (error instanceof ValidationError || error instanceof APIError) {
                throw error;
            }
            throw new APIError('An error occurred during verification', 'WOS_API', error);
        }
    }

    /**
     * Handles approval button clicks
     * @param {Object} interaction - Discord interaction object
     * @param {string} userId - User ID to approve
     */
    static async handleApproval(interaction, userId) {
        try {
            const member = await interaction.guild.members.fetch(userId);
            await User.findOneAndUpdate({ discordId: userId }, { verified: true });
            
            // Add member role and remove default role
            const memberRole = interaction.guild.roles.cache.get(get('roles.memberRole'));
            const defaultRole = interaction.guild.roles.cache.get(get('roles.defaultRole'));
            
            if (memberRole) await member.roles.add(memberRole);
            if (defaultRole) await member.roles.remove(defaultRole);

            // Log approval
            const botActivityChannel = interaction.guild.channels.cache.find(
                ch => ch.name.includes('📝-bot-activity') && ch.isTextBased()
            );
            if (botActivityChannel) {
                await botActivityChannel.send({
                    content: `✅ <@${userId}> approved by <@${interaction.user.id}> and assigned Member role.`
                });
            }

            // Disable buttons
            await this.disableVerificationButtons(interaction);
            await interaction.reply({ 
                content: `✅ Approved by <@${interaction.user.id}>`, 
                flags: 0 
            });

            // Notify user
            try {
                await member.send('✅ You have been verified and promoted to Member!');
            } catch (dmError) {
                console.log(`Could not send DM to ${userId}:`, dmError.message);
            }

        } catch (error) {
            console.error('Approval error:', error);
            await interaction.reply({ 
                content: '❌ An error occurred during approval.', 
                flags: 64 
            });
        }
    }

    /**
     * Handles rejection button clicks
     * @param {Object} interaction - Discord interaction object
     * @param {string} userId - User ID to reject
     */
    static async handleRejection(interaction, userId) {
        try {
            await User.findOneAndDelete({ discordId: userId });

            // Log rejection
            const botActivityChannel = interaction.guild.channels.cache.find(
                ch => ch.name.includes('bot-activity') && ch.isTextBased()
            );
            if (botActivityChannel) {
                await botActivityChannel.send({
                    content: `❌ <@${userId}> rejected by <@${interaction.user.id}>.`
                });
            }

            // Disable buttons
            await this.disableVerificationButtons(interaction);
            await interaction.reply({ 
                content: `❌ Rejected by <@${interaction.user.id}>`, 
                flags: 0 
            });

            // Notify user
            try {
                const member = await interaction.guild.members.fetch(userId);
                await member.send('❌ Your verification was rejected by the leaders.');
            } catch (dmError) {
                console.log(`Could not send DM to ${userId}:`, dmError.message);
            }

        } catch (error) {
            console.error('Rejection error:', error);
            await interaction.reply({ 
                content: '❌ An error occurred during rejection.', 
                flags: 64 
            });
        }
    }

    /**
     * Fetches player data from Whiteout Survival API
     * @param {string} fid - Player FID
     * @returns {Object|null} Player data or null if not found
     */
    static async fetchPlayerData(fid) {
        const secret = get('api.wosApiSecret');
        const currentTime = Date.now();
        const baseForm = `fid=${fid}&time=${currentTime}`;
        const sign = crypto.createHash('md5').update(baseForm + secret).digest('hex');
        const fullForm = `sign=${sign}&${baseForm}`;

        const response = await fetch('https://wos-giftcode-api.centurygame.com/api/player', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: fullForm
        });

        const data = await response.json();
        return data.data;
    }

    /**
     * Sends verification request to leaders
     * @param {Object} interaction - Discord interaction object
     * @param {Object} playerData - Player data from API
     */
    static async sendVerificationRequest(interaction, playerData) {
        const guild = interaction.guild || await interaction.client.guilds.fetch(get('discord.guildId'));
        const leadersRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('leader'));
        const verifyLogsChannel = guild.channels.cache.find(
            ch => ch.name.includes('verification-logs') && ch.isTextBased()
        );

        if (leadersRole && verifyLogsChannel) {
            const embed = new EmbedBuilder()
                .setTitle('New Verification Request')
                .setDescription(`User: <@${interaction.user.id}>
FID: ${playerData.fid}
Nickname: **${playerData.nickname}**
Furnace Level: **${playerData.furnaceLevel}**`)
                .setColor(0x1e90ff)
                .setThumbnail(playerData.avatar_image)
                .setFooter({ text: `Manual approval required | ${brandingText}` });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`approve_${interaction.user.id}`)
                    .setLabel('Approve')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`reject_${interaction.user.id}`)
                    .setLabel('Reject')
                    .setStyle(ButtonStyle.Danger)
            );

            await verifyLogsChannel.send({ 
                content: `${leadersRole}`, 
                embeds: [embed], 
                components: [row] 
            });
        }
    }

    /**
     * Disables verification buttons after action
     * @param {Object} interaction - Discord interaction object
     */
    static async disableVerificationButtons(interaction) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('approve_disabled')
                .setLabel('Approve')
                .setStyle(ButtonStyle.Success)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('reject_disabled')
                .setLabel('Reject')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(true)
        );
        await interaction.message.edit({ components: [row] });
    }
}

module.exports = VerificationHandler;
