const BotInfoMessage = require('../database/models/BotInfoMessage');
const { generateBotInfoEmbed } = require('../utils/bot-info.js');

async function updateBotInfo(client) {
    try {
        // Assuming the bot is in one guild, for a private bot this is safe.
        const guildId = client.guilds.cache.first()?.id;
        if (!guildId) return;

        const infoMessageDoc = await BotInfoMessage.findOne({ guildId: guildId });

        if (infoMessageDoc) {
            const guild = await client.guilds.fetch(infoMessageDoc.guildId).catch(() => null);
            if (!guild) return;

            const channel = await guild.channels.fetch(infoMessageDoc.channelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return;

            const message = await channel.messages.fetch(infoMessageDoc.messageId).catch(() => null);
            if (!message) return;

            const newEmbed = await generateBotInfoEmbed(client);
            await message.edit({ embeds: [newEmbed] });
        }
    } catch (error) {
        console.error('[UpdateBotInfo] Error updating bot info message:', error);
    }
}

module.exports = (client) => {
    // Run after a short delay, then every 5 minutes
    setTimeout(() => updateBotInfo(client), 10 * 1000); // Initial 15s delay 
    setInterval(() => updateBotInfo(client), 10 * 1000);
    console.log('[UpdateBotInfo] Background task started.');
};