const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../database/models.User');
const axios = require('axios');
const crypto = require('crypto');
const { brandingText } = require('../utils/branding.js');
const { get } = require('../utils/config');

// --- Game API Constants and Helpers ---
const API_ENDPOINT = 'https://wos-giftcode-api.centurygame.com/api/player';

const LEVEL_MAPPING = {
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

const EMBED_COLORS = {
    SUCCESS: '#0099ff',
    ERROR: '#ff0000'
};

const BASE_FURNACE_LEVEL = 30;

async function fetchGameData(gameId) {
    const API_SECRET = get('api.wosApiSecret');
    const currentTime = Date.now();
    const baseForm = `fid=${gameId}&time=${currentTime}`;
    const sign = crypto.createHash('md5').update(baseForm + API_SECRET).digest('hex');
    const fullForm = `sign=${sign}&${baseForm}`;

    const response = await axios.post(API_ENDPOINT, fullForm, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    const data = response.data;

    if (data.code !== 0 || !data.data || !data.data.nickname) {
        throw new Error(data.msg || 'API returned an unexpected response or error code.');
    }
    return {
        nickname: data.data.nickname,
        stove_lv: data.data.stove_lv,
        avatar_image: data.data.avatar_image
    };
}

/**
 * Fetches a user's game info and returns an embed.
 * @param {import('discord.js').User} targetUser The user to get info for.
 * @returns {Promise<EmbedBuilder>}
 */
async function getPlayerInfo(targetUser) {
    const userData = await User.findOne({ discordId: targetUser.id });

    if (!userData || !userData.verified) {
        return new EmbedBuilder()
            .setColor(EMBED_COLORS.ERROR)
            .setDescription(`${targetUser.tag} is not verified in the database.`);
    }

    if (!userData.gameId) {
        return new EmbedBuilder()
            .setColor(EMBED_COLORS.ERROR)
            .setDescription(`${targetUser.tag} is verified but does not have a Game ID (FID) linked.`);
    }

    try {
        const gameData = await fetchGameData(userData.gameId);
        const furnaceLevel = gameData.stove_lv > BASE_FURNACE_LEVEL
            ? LEVEL_MAPPING[gameData.stove_lv] || `FC Level ${gameData.stove_lv}`
            : `Level ${gameData.stove_lv}`;

        return new EmbedBuilder()
            .setColor(EMBED_COLORS.SUCCESS)
            .setTitle(`Alliance Roster: ${gameData.nickname}`)
            .setAuthor({ name: targetUser.tag, iconURL: targetUser.displayAvatarURL() })
            .setDescription(`Current verified game stats for this member.`)
            .addFields(
                { name: 'Game ID (FID)', value: userData.gameId.toString(), inline: true },
                { name: 'Game Nickname', value: gameData.nickname, inline: true },
                { name: 'Furnace / FC Level', value: furnaceLevel, inline: false },
            )
            .setThumbnail(gameData.avatar_image)
            .setTimestamp()
            .setFooter({ text: 'Data sourced from Game API' });

    } catch (error) {
        console.error(`Error fetching player info for ${targetUser.id} (FID: ${userData.gameId}):`, error);
        return new EmbedBuilder()
            .setColor(EMBED_COLORS.ERROR)
            .setTitle('❌ Error Retrieving Game Data')
            .setDescription(`Could not fetch live data for ${targetUser.tag}. The game API may be down or the FID (${userData.gameId}) is invalid.`)
            .addFields(
                { name: 'Database Status', value: `Verified with FID: ${userData.gameId}`, inline: true },
                { name: 'Error Message', value: error.message.substring(0, 250) || 'Unknown API Error', inline: true }
            )
            .setTimestamp()
            .setFooter({ text: brandingText });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playerinfo')
        .setDescription('Retrieves detailed game information for a verified alliance member.')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The member to check (defaults to you).')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply();
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const infoEmbed = await getPlayerInfo(targetUser);
        await interaction.editReply({ embeds: [infoEmbed] });
    },
    getPlayerInfo,
};