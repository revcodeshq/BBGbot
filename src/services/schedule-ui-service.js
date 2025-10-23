/**
 * Schedule UI Service
 * Handles UI generation for schedule-related embeds and components
 */

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const { brandingText } = require('../utils/branding');

class ScheduleUIService {
    constructor() {
        this.colors = {
            SUCCESS: '#00ff00',
            ERROR: '#ff0000',
            INFO: '#0099ff',
            WARNING: '#ffa500'
        };
    }

    /**
     * Creates confirmation embed for new announcements
     * @param {Object} announcementData - Announcement data
     * @param {Object} channel - Discord channel
     * @param {Object} role - Optional role to mention
     * @returns {EmbedBuilder} Confirmation embed
     */
    createConfirmationEmbed(announcementData, channel, role = null) {
        const embed = new EmbedBuilder()
            .setColor(this.colors.INFO)
            .setTitle('📅 Schedule Confirmation')
            .setDescription('Please confirm the announcement details:')
            .addFields(
                {
                    name: '⏰ Time',
                    value: `**${announcementData.time} UTC**`,
                    inline: true
                },
                {
                    name: '🔄 Interval',
                    value: `**${announcementData.interval}**`,
                    inline: true
                },
                {
                    name: '📝 Message',
                    value: announcementData.content.length > 1000 
                        ? announcementData.content.substring(0, 1000) + '...'
                        : announcementData.content,
                    inline: false
                },
                {
                    name: '📍 Channel',
                    value: `<#${channel.id}>`,
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({ text: brandingText });

        if (role) {
            embed.addFields({
                name: '👥 Mention Role',
                value: `<@&${role.id}>`,
                inline: true
            });
        }

        if (announcementData.dayOfWeek !== undefined) {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            embed.addFields({
                name: '📅 Day of Week',
                value: `**${days[announcementData.dayOfWeek]}**`,
                inline: true
            });
        }

        return embed;
    }

    /**
     * Creates confirmation buttons
     * @returns {ActionRowBuilder} Button row
     */
    createConfirmationButtons() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('schedule_confirm')
                    .setLabel('✅ Confirm')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('schedule_cancel')
                    .setLabel('❌ Cancel')
                    .setStyle(ButtonStyle.Danger)
            );
    }

    /**
     * Creates announcement list embeds
     * @param {Array} announcements - Array of announcements with metadata
     * @param {Object} guild - Discord guild
     * @returns {Array<EmbedBuilder>} Array of embeds
     */
    createAnnouncementListEmbeds(announcements, guild) {
        if (announcements.length === 0) {
            return [this.createEmptyListEmbed()];
        }

        const embeds = [];
        const maxPerEmbed = 10;
        
        // Sort by next run time
        const sortedAnnouncements = announcements.sort((a, b) => a.sortKey - b.sortKey);
        
        for (let i = 0; i < sortedAnnouncements.length; i += maxPerEmbed) {
            const chunk = sortedAnnouncements.slice(i, i + maxPerEmbed);
            const embed = this.createAnnouncementListEmbed(chunk, guild, i === 0);
            embeds.push(embed);
        }
        
        return embeds;
    }

    /**
     * Creates a single announcement list embed
     * @param {Array} announcements - Chunk of announcements
     * @param {Object} guild - Discord guild
     * @param {boolean} isFirst - Whether this is the first embed
     * @returns {EmbedBuilder} List embed
     */
    createAnnouncementListEmbed(announcements, guild, isFirst = false) {
        const embed = new EmbedBuilder()
            .setColor(this.colors.INFO)
            .setTitle(isFirst ? '📅 Scheduled Announcements' : '📅 Scheduled Announcements (continued)')
            .setTimestamp()
            .setFooter({ text: brandingText });

        announcements.forEach((ann, index) => {
            const channel = guild.channels.cache.get(ann.channelId);
            const channelName = channel ? `#${channel.name}` : 'Unknown Channel';
            
            embed.addFields({
                name: `${index + 1}. ${ann.interval} at ${ann.time} UTC`,
                value: `**Channel:** ${channelName}\n**Next Run:** ${ann.nextRunString}\n**Message:** ${ann.content.substring(0, 100)}${ann.content.length > 100 ? '...' : ''}`,
                inline: false
            });
        });

        return embed;
    }

    /**
     * Creates empty list embed
     * @returns {EmbedBuilder} Empty list embed
     */
    createEmptyListEmbed() {
        return new EmbedBuilder()
            .setColor(this.colors.WARNING)
            .setTitle('📅 No Scheduled Announcements')
            .setDescription('There are no scheduled announcements for this server.')
            .setTimestamp()
            .setFooter({ text: brandingText });
    }

    /**
     * Creates success embed
     * @param {string} message - Success message
     * @returns {EmbedBuilder} Success embed
     */
    createSuccessEmbed(message) {
        return new EmbedBuilder()
            .setColor(this.colors.SUCCESS)
            .setTitle('✅ Success')
            .setDescription(message)
            .setTimestamp()
            .setFooter({ text: brandingText });
    }

    /**
     * Creates error embed
     * @param {string} message - Error message
     * @returns {EmbedBuilder} Error embed
     */
    createErrorEmbed(message) {
        return new EmbedBuilder()
            .setColor(this.colors.ERROR)
            .setTitle('❌ Error')
            .setDescription(message)
            .setTimestamp()
            .setFooter({ text: brandingText });
    }

    /**
     * Creates timezone conversion result embed
     * @param {string} localTime - Local time
     * @param {string} timezone - Timezone
     * @param {string} utcTime - UTC time result
     * @returns {EmbedBuilder} Conversion result embed
     */
    createTimezoneConversionEmbed(localTime, timezone, utcTime) {
        return new EmbedBuilder()
            .setColor(this.colors.SUCCESS)
            .setTitle('🕐 Timezone Conversion')
            .setDescription('Time successfully converted to UTC format')
            .addFields(
                {
                    name: '🕐 Local Time',
                    value: `**${localTime} ${timezone}**`,
                    inline: true
                },
                {
                    name: '🌍 UTC Time',
                    value: `**${utcTime} UTC**`,
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({ text: brandingText });
    }

    /**
     * Creates management buttons for announcements
     * @param {string} announcementId - Announcement ID
     * @returns {ActionRowBuilder} Button row
     */
    createManagementButtons(announcementId) {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`schedule_edit_${announcementId}`)
                    .setLabel('✏️ Edit')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`schedule_delete_${announcementId}`)
                    .setLabel('🗑️ Delete')
                    .setStyle(ButtonStyle.Danger)
            );
    }
}

module.exports = ScheduleUIService;
