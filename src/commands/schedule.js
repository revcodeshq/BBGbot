const {
    SlashCommandBuilder,
    PermissionsBitField
} = require('discord.js');

const ScheduleUIService = require('../services/schedule-ui-service');
const { validateTimeString, sanitizeInput } = require('../utils/validators');
const { ValidationError } = require('../utils/error-handler');
const { ErrorHandler } = require('../utils/error-handler');
const { metrics } = require('../utils/metrics');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('Schedule an announcement with an interactive wizard.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    async execute(interaction) {
        // Interactive wizard for scheduling announcements
        try {
            metrics.trackCommand('schedule', interaction.user.id, 0, true);
            const uiService = new ScheduleUIService();
            // Step 1: Choose channel
            // Show main menu with buttons
            const mainMenuButtons = uiService.createMainMenuButtons();
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '**Schedule Main Menu**\nChoose an action below:',
                    components: [mainMenuButtons]
                });
            } else {
                await interaction.editReply({
                    content: '**Schedule Main Menu**\nChoose an action below:',
                    components: [mainMenuButtons]
                });
            }
            // The rest of the wizard will be handled in interactionCreate.js (button/select handlers)
        } catch (error) {
            metrics.trackError(error, 'schedule');
            const errorResponse = ErrorHandler.handleError(error, {
                interaction,
                user: interaction.user,
                guild: interaction.guild,
                channel: interaction.channel,
                command: 'schedule'
            });
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: errorResponse.userMessage, ephemeral: true });
            } else {
                await interaction.editReply({ content: errorResponse.userMessage });
            }
            await logger.logBotActivity('Schedule Command Error', error.message, interaction);
        }
    },

    /**
     * Handles the set subcommand
     */
    async handleSetCommand(interaction, announcementService, uiService) {
        const time = sanitizeInput(interaction.options.getString('time'));
        const interval = interaction.options.getString('interval');
        const content = sanitizeInput(interaction.options.getString('message'));
        const channel = interaction.options.getChannel('channel');
        const role = interaction.options.getRole('mention_role');
        const dayOfWeek = interaction.options.getInteger('day_of_week');
        const daysInterval = interaction.options.getInteger('days_interval');
        const weeksInterval = interaction.options.getInteger('weeks_interval');
        
        // Validate inputs
        if (!validateTimeString(time)) {
            throw new ValidationError('Invalid time format. Please use HH:MM (24-hour UTC).', 'time');
        }
        
        if (!channel.isTextBased()) {
            throw new ValidationError('The selected channel must be a text-based channel.', 'channel');
        }
        
        // Interval-specific validation
        if (interval === 'WEEKLY' && dayOfWeek === null) {
            throw new ValidationError('The WEEKLY interval requires the day_of_week option (0=Sunday to 6=Saturday).', 'day_of_week');
        }
        if (interval === 'CUSTOM_DAYS' && daysInterval === null) {
            throw new ValidationError('The CUSTOM_DAYS interval requires the days_interval option (minimum 2 days).', 'days_interval');
        }
        if (interval === 'CUSTOM_WEEKS' && weeksInterval === null) {
            throw new ValidationError('The CUSTOM_WEEKS interval requires the weeks_interval option (minimum 1 week).', 'weeks_interval');
        }
        
        // Create announcement data
        const announcementData = {
            guildId: interaction.guild.id,
            channelId: channel.id,
            time,
            interval,
            content,
            roleId: role?.id,
            dayOfWeek,
            daysInterval,
            weeksInterval,
            authorId: interaction.user.id
        };
        
        // Create confirmation UI
        const confirmationEmbed = uiService.createConfirmationEmbed(announcementData, channel, role);
        const buttons = uiService.createConfirmationButtons();
        
        await interaction.editReply({
            embeds: [confirmationEmbed],
            components: [buttons]
        });
        
        // Store announcement data for confirmation
        // This would typically be stored in a temporary cache or database
        // For now, we'll create the announcement directly
        const announcement = await announcementService.createAnnouncement(announcementData);
        
        const successEmbed = uiService.createSuccessEmbed(
            `Announcement scheduled successfully!\n**ID:** ${announcement._id}\n**Time:** ${time} UTC\n**Interval:** ${interval}`
        );
        
        await interaction.editReply({
            embeds: [successEmbed],
            components: []
        });
    },

    /**
     * Handles the list subcommand
     */
    async handleListCommand(interaction, announcementService, uiService) {
        const announcements = await announcementService.getAnnouncementsWithMetadata(interaction.guild.id);
        const embeds = uiService.createAnnouncementListEmbeds(announcements, interaction.guild);
        
        await interaction.editReply({
            embeds: embeds.slice(0, 10) // Discord limit
        });
    },

    /**
     * Handles the delete subcommand
     */
    async handleDeleteCommand(interaction, announcementService, uiService) {
        const announcementId = sanitizeInput(interaction.options.getString('id'));
        
        await announcementService.deleteAnnouncement(announcementId);
        
        const successEmbed = uiService.createSuccessEmbed(
            `Announcement ${announcementId} deleted successfully!`
        );
        
        await interaction.editReply({
            embeds: [successEmbed]
        });
    },

    /**
     * Handles the convert subcommand
     */
    async handleConvertCommand(interaction, timezoneService, uiService) {
        const localTime = sanitizeInput(interaction.options.getString('local_time'));
        const timezone = sanitizeInput(interaction.options.getString('local_timezone'));
        
        const utcTime = await timezoneService.convertToUTC(localTime, timezone);
        
        const conversionEmbed = uiService.createTimezoneConversionEmbed(localTime, timezone, utcTime);
        
        await interaction.editReply({
            embeds: [conversionEmbed]
        });
    },

    /**
     * Handles the status subcommand
     */
    async handleStatusCommand(interaction, announcementService, uiService) {
        const announcements = await announcementService.getAnnouncementsWithMetadata(interaction.guild.id);
        const embeds = uiService.createAnnouncementListEmbeds(announcements, interaction.guild);
        
        await interaction.editReply({
            embeds: embeds.slice(0, 10) // Discord limit
        });
    }
};
