const { EmbedBuilder } = require('discord.js');
const DisplayMessage = require('../database/models.DisplayMessage');
const Announcement = require('../database/models.Announcements');
const { calculateNextRunTimeMetadata, getIntervalDisplayName } = require('../commands/schedule');
const logger = require('../utils/logger');
const { brandingText } = require('../utils/branding.js');

const updateSchedule = async (client) => {
    try {
        const displayMessages = await DisplayMessage.find();

        for (const displayMessage of displayMessages) {
            const guild = await client.guilds.fetch(displayMessage.guildId);
            if (!guild) {
                logger.warn(`[UpdateSchedule] Guild not found: ${displayMessage.guildId}`);
                continue;
            }

            const channel = await guild.channels.fetch(displayMessage.channelId);
            if (!channel || !channel.isTextBased()) {
                logger.warn(`[UpdateSchedule] Channel not found or not text-based: ${displayMessage.channelId}`);
                continue;
            }

            const message = await channel.messages.fetch(displayMessage.messageId);
            if (!message) {
                logger.warn(`[UpdateSchedule] Message not found: ${displayMessage.messageId}`);
                continue;
            }

            const announcements = await Announcement.find({ guildId: displayMessage.guildId });

            const now = new Date();
            const upcomingEvents = [];

            for (const ann of announcements) {
                const metadata = calculateNextRunTimeMetadata(ann, now);
                if (metadata.sortKey < 999999) {
                    upcomingEvents.push({
                        ...ann.toObject(),
                        sortKey: metadata.sortKey,
                        nextRunString: metadata.nextRunString
                    });
                }
            }

            upcomingEvents.sort((a, b) => a.sortKey - b.sortKey);

            const eventEmbed = new EmbedBuilder()
                .setTitle('🗓️ Upcoming Alliance Events')
                .setDescription('Here are the upcoming scheduled events. All times are in UTC. Refer to the respective channels for more details.')
                .setColor(0xFFD700) // Gold color
                .setTimestamp()
                .setFooter({ text: `This board is updated automatically. | ${brandingText}`, iconURL: guild.iconURL() });

            if (upcomingEvents.length === 0) {
                eventEmbed.addFields({ name: 'No Upcoming Events', value: 'There are no immediate upcoming events scheduled. Check back later!' });
            } else {
                upcomingEvents.slice(0, 7).forEach(event => {
                    const contentPreview = event.content.substring(0, 200) + (event.content.length > 200 ? '...' : '');
                    eventEmbed.addFields({
                        name: `\`${event.time} UTC\` - ${getIntervalDisplayName(event)}`,
                        value: `**Next Run:** ${event.nextRunString}\n**Channel:** <#${event.channelId}>\n**Message:** *${contentPreview}*`
                    });
                });
            }

            await message.edit({ embeds: [eventEmbed] });
        }
    } catch (error) {
    console.error(`[UpdateSchedule] Error updating schedule: ${error.message}`, error);
    if (logger.logBotActivity) logger.logBotActivity('UpdateSchedule Error', error.message, client);
    }
};

module.exports = (client) => {
    updateSchedule(client); // Run once on startup
    setInterval(() => updateSchedule(client), 5 * 60 * 1000); // Update every 5 minutes
};
