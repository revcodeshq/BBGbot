const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { brandingText } = require('../utils/branding');

class ScheduleUIService {
    createMainMenuButtons() {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('schedule_create')
                .setLabel('Create Schedule')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('schedule_list')
                .setLabel('List Schedules')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('schedule_delete')
                .setLabel('Delete Schedule')
                .setStyle(ButtonStyle.Danger)
        );
    }
    constructor() {
        this.colors = {
            SUCCESS: '#00ff00',
            ERROR: '#ff0000',
            INFO: '#0099ff',
            WARNING: '#ffa500'
        };
    }

    createChannelSelect(options) {
        // Ensure all options have string values and valid labels
        const safeOptions = options
            .filter(opt => typeof opt.label === 'string' && typeof opt.value !== 'undefined')
            .map(opt => ({
                label: String(opt.label),
                value: String(opt.value),
                description: opt.description ? String(opt.description) : undefined
            }));
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('schedule_channel')
                .setPlaceholder('Select a channel')
                .addOptions(safeOptions)
        );
    }

    createMessagePrompt() {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('schedule_message_prompt')
                .setLabel('Enter message')
                .setStyle(ButtonStyle.Primary)
        );
    }

    createTimeSelect() {
        // Create hour options from 0 to 23
        const hourOptions = [];
        for (let hour = 0; hour < 24; hour++) {
            const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
            const ampm = hour < 12 ? 'AM' : 'PM';
            const label = `${hour.toString().padStart(2, '0')}:00 (${hour12}:00 ${ampm})`;
            hourOptions.push({
                label,
                value: `${hour.toString().padStart(2, '0')}:00`
            });
        }
        
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('schedule_hour')
                .setPlaceholder('Select hour (24-hour format)')
                .addOptions(hourOptions)
        );
    }

    createFrequencySelect() {
        const frequencyOptions = [
            { label: 'Just once', value: 'once' }
        ];
        
        // Add daily options (1d, 2d, 3d, 4d)
        for (let days = 1; days <= 4; days++) {
            frequencyOptions.push({
                label: `Every ${days} day${days > 1 ? 's' : ''}`,
                value: `every_${days}d`
            });
        }
        
        // Add weekly options (1w, 2w, 3w, 4w)
        for (let weeks = 1; weeks <= 4; weeks++) {
            frequencyOptions.push({
                label: `Every ${weeks} week${weeks > 1 ? 's' : ''}`,
                value: `every_${weeks}w`
            });
        }
        
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('schedule_frequency')
                .setPlaceholder('Select frequency')
                .addOptions(frequencyOptions)
        );
    }

    createStartDateSelect() {
        const now = new Date();
        // Use UTC to avoid timezone issues
        const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); // Start of today in UTC
        console.log('[DEBUG] Creating start date select. Today (UTC):', today.toISOString());
        
        const options = [
            {
                label: `Today (${new Date(today.getTime()).toLocaleDateString()})`,
                value: 'today'
            },
            {
                label: `Tomorrow (${new Date(today.getTime() + 24 * 60 * 60 * 1000).toLocaleDateString()})`,
                value: 'tomorrow'
            }
        ];
        
        // Add options for next 5 days
        for (let days = 2; days <= 6; days++) {
            const futureDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000);
            options.push({
                label: `In ${days} days (${futureDate.toLocaleDateString()})`,
                value: `in_${days}_days`
            });
            console.log(`[DEBUG] Added option: In ${days} days (${futureDate.toLocaleDateString()})`);
        }
        
        // Add next week
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        options.push({
            label: `Next week (${nextWeek.toLocaleDateString()})`,
            value: 'next_week'
        });
        
        console.log('[DEBUG] Start date options created:', options.map(o => ({ label: o.label, value: o.value })));
        
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('schedule_start_date')
                .setPlaceholder('Select when to start the schedule')
                .addOptions(options)
        );
    }

    createIntervalButtons() {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('interval_once').setLabel('Once').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('interval_daily').setLabel('Daily').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('interval_weekly').setLabel('Weekly').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('interval_custom').setLabel('Custom').setStyle(ButtonStyle.Secondary)
        );
    }

    createRoleSelect(roles) {
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('schedule_role')
                .setPlaceholder('Select a role to mention (optional)')
                .addOptions(roles)
        );
    }

    createPreviewEmbed(data) {
        const intervalDisplay = this.formatIntervalForDisplay(data.interval);
        let startDateDisplay = 'Today';
        
        if (data.startDate) {
            // Parse the date correctly - data.startDate is in YYYY-MM-DD format
            const [year, month, day] = data.startDate.split('-').map(Number);
            // Create date at noon UTC to match the calculation logic
            const startDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
            startDateDisplay = startDate.toLocaleDateString();
        }
        
        return new EmbedBuilder()
            .setTitle('Preview Announcement')
            .setDescription(data.content)
            .addFields(
                { name: 'Channel', value: `<#${data.channelId}>`, inline: true },
                { name: 'Time', value: data.time + ' UTC', inline: true },
                { name: 'Frequency', value: intervalDisplay, inline: true },
                { name: 'Start Date', value: startDateDisplay, inline: true },
                { name: 'Role', value: data.roleId ? `<@&${data.roleId}>` : 'None', inline: true }
            );
    }

    formatIntervalForDisplay(interval) {
        const displayMap = {
            'ONCE': 'Just once',
            'DAILY': 'Every day',
            'DAILY_2': 'Every 2 days',
            'DAILY_3': 'Every 3 days',
            'DAILY_4': 'Every 4 days',
            'WEEKLY': 'Every week',
            'WEEKLY_2': 'Every 2 weeks',
            'WEEKLY_3': 'Every 3 weeks',
            'WEEKLY_4': 'Every 4 weeks'
        };
        return displayMap[interval] || interval;
    }

    createConfirmButtons() {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('schedule_confirm').setLabel('Confirm').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('schedule_cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger)
        );
    }

    // ...existing code for confirmation, list, error, etc. embeds and buttons...
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

    createAnnouncementListEmbed(announcements, guild, isFirst = false) {
        const embed = new EmbedBuilder()
            .setColor(this.colors.INFO)
            .setTitle(isFirst ? '📅 Scheduled Announcements' : '📅 Scheduled Announcements (continued)')
            .setTimestamp()
            .setFooter({ text: brandingText });

        announcements.forEach((ann, index) => {
            const channel = guild.channels.cache.get(ann.channelId);
            const channelName = channel ? `#${channel.name}` : 'Unknown Channel';
            const intervalDisplay = this.formatIntervalForDisplay(ann.interval);
            
            embed.addFields({
                name: `${index + 1}. ${intervalDisplay} at ${ann.time} UTC`,
                value: `**Channel:** ${channelName}\n**Next Run:** ${ann.nextRunString}\n**Message:** ${ann.content.substring(0, 100)}${ann.content.length > 100 ? '...' : ''}`,
                inline: false
            });
        });

        return embed;
    }

    createEmptyListEmbed() {
        return new EmbedBuilder()
            .setColor(this.colors.WARNING)
            .setTitle('📅 No Scheduled Announcements')
            .setDescription('There are no scheduled announcements for this server.')
            .setTimestamp()
            .setFooter({ text: brandingText });
    }

    createSuccessEmbed(message) {
        return new EmbedBuilder()
            .setColor(this.colors.SUCCESS)
            .setTitle('✅ Success')
            .setDescription(message)
            .setTimestamp()
            .setFooter({ text: brandingText });
    }

    createErrorEmbed(message) {
        return new EmbedBuilder()
            .setColor(this.colors.ERROR)
            .setTitle('❌ Error')
            .setDescription(message)
            .setTimestamp()
            .setFooter({ text: brandingText });
    }

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
