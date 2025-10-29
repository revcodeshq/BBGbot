const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../database/models.User');
const PlayerInfoService = require('../services/player-info-service');
const { ValidationError, APIError } = require('../utils/error-handler');
const { brandingText } = require('../utils/branding');
const InteractionHandler = require('../utils/interaction-handler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playerinfo')
        .setDescription('Retrieves detailed game information for a verified alliance member.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The member to check (defaults to you).')
                .setRequired(false)
        ),

    async execute(interaction) {
        await InteractionHandler.executeCommand(interaction, async (interaction) => {
            // Get target user
            const targetUser = interaction.options.getUser('user') || interaction.user;
            
            // Initialize service
            const playerInfoService = new PlayerInfoService();
            
            // Get player info
            const infoEmbed = await this.getPlayerInfoEmbed(targetUser, playerInfoService);
            
            // Send response
            await interaction.editReply({ embeds: [infoEmbed] });
        });
    },

    /**
     * Gets player info embed with enhanced error handling
     * @param {Object} targetUser - Discord user object
     * @param {PlayerInfoService} playerInfoService - Service instance
     * @returns {Promise<EmbedBuilder>} Player info embed
     */
    async getPlayerInfoEmbed(targetUser, playerInfoService) {
        try {
            // Fetch user data from database
            const userData = await User.findOne({ discordId: targetUser.id });
            
            if (!userData || !userData.verified) {
                return this.createErrorEmbed(
                    `${targetUser.tag} is not verified in the database.`,
                    'User Not Verified'
                );
            }
            
            if (!userData.gameId) {
                return this.createErrorEmbed(
                    `${targetUser.tag} is verified but does not have a Game ID (FID) linked.`,
                    'No Game ID'
                );
            }
            
            // Validate FID
            if (!playerInfoService.validateFID(userData.gameId)) {
                return this.createErrorEmbed(
                    `Invalid FID format for ${targetUser.tag}: ${userData.gameId}`,
                    'Invalid FID'
                );
            }
            
            // Fetch game data
            const gameData = await playerInfoService.fetchGameData(userData.gameId);
            
            // Create success embed
            return this.createSuccessEmbed(targetUser, userData, gameData, playerInfoService);
            
        } catch (error) {
            console.error(`Error fetching player info for ${targetUser.id}:`, error);
            
            if (error instanceof ValidationError) {
                return this.createErrorEmbed(
                    `Validation error: ${error.message}`,
                    'Invalid Input'
                );
            }
            
            if (error instanceof APIError) {
                return this.createErrorEmbed(
                    `Game API error: ${error.message}`,
                    'API Error'
                );
            }
            
            return this.createErrorEmbed(
                `Unexpected error occurred while fetching data for ${targetUser.tag}`,
                'Unknown Error'
            );
        }
    },

    /**
     * Creates success embed with player information
     * @param {Object} targetUser - Discord user
     * @param {Object} userData - Database user data
     * @param {Object} gameData - Game API data
     * @param {PlayerInfoService} playerInfoService - Service instance
     * @returns {EmbedBuilder} Success embed
     */
    createSuccessEmbed(targetUser, userData, gameData, playerInfoService) {
        const playerInfo = playerInfoService.getPlayerInfo(userData, gameData, targetUser);
        
        return new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`Alliance Roster: ${playerInfo.game.nickname}`)
            .setAuthor({ 
                name: targetUser.tag, 
                iconURL: targetUser.displayAvatarURL() 
            })
            .setDescription('Current verified game stats for this member.')
            .addFields(
                { 
                    name: 'Game ID (FID)', 
                    value: playerInfo.game.fid.toString(), 
                    inline: true 
                },
                { 
                    name: 'Game Nickname', 
                    value: playerInfo.game.nickname, 
                    inline: true 
                },
                { 
                    name: 'Furnace / FC Level', 
                    value: playerInfo.game.furnaceLevel, 
                    inline: false 
                }
            )
            .setThumbnail(playerInfo.game.avatarImage)
            .setTimestamp()
            .setFooter({ text: 'Data sourced from Game API | ' + brandingText });
    },

    /**
     * Creates error embed
     * @param {string} message - Error message
     * @param {string} title - Error title
     * @returns {EmbedBuilder} Error embed
     */
    createErrorEmbed(message, title = 'Error') {
        return new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle(`❌ ${title}`)
            .setDescription(message)
            .setTimestamp()
            .setFooter({ text: brandingText });
    }
};
