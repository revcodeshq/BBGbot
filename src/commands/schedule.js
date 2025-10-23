const {
    SlashCommandBuilder,
    PermissionsBitField
} = require('discord.js');

const TimezoneConversionService = require('../services/timezone-service');
const AnnouncementService = require('../services/announcement-service');
const ScheduleUIService = require('../services/schedule-ui-service');
const { validateTimeString, sanitizeInput } = require('../utils/validators');
const { ValidationError, APIError } = require('../utils/error-handler');
const { ErrorHandler } = require('../utils/error-handler');
const { metrics } = require('../utils/metrics');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('Manages scheduled announcements.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        
        // SET subcommand
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Schedules a new recurring or one-time announcement.')
                .addStringOption(option =>
                    option.setName('time')
                        .setDescription('The time to send the announcement (e.g., 14:30). MUST be in 24-hour UTC format.')
                        .setRequired(true)
                        .setMinLength(5)
                        .setMaxLength(5)
                )
                .addStringOption(option =>
                    option.setName('interval')
                        .setDescription('How often the announcement should repeat.')
                        .setRequired(true)
                        .addChoices(
                            { name: 'One-time', value: 'ONCE' },
                            { name: 'Daily', value: 'DAILY' },
                            { name: 'Weekly', value: 'WEEKLY' },
                            { name: 'Custom Days', value: 'CUSTOM_DAYS' },
                            { name: 'Custom Weeks', value: 'CUSTOM_WEEKS' }
                        )
                )
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('The message content for the announcement.')
                        .setRequired(true)
                        .setMaxLength(1900)
                )
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel where the announcement should be sent.')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName('mention_role')
                        .setDescription('Optional role to mention with the announcement.')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option.setName('day_of_week')
                        .setDescription('Day of week for weekly announcements (0=Sunday, 6=Saturday).')
                        .setRequired(false)
                        .setMinValue(0)
                        .setMaxValue(6)
                )
                .addIntegerOption(option =>
                    option.setName('days_interval')
                        .setDescription('Number of days for custom interval (minimum 2).')
                        .setRequired(false)
                        .setMinValue(2)
                )
                .addIntegerOption(option =>
                    option.setName('weeks_interval')
                        .setDescription('Number of weeks for custom interval (minimum 1).')
                        .setRequired(false)
                        .setMinValue(1)
                )
        )
        
        // LIST subcommand
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lists all scheduled announcements.')
        )
        
        // DELETE subcommand
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Deletes a scheduled announcement.')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('The ID of the announcement to delete.')
                        .setRequired(true)
                )
        )
        
        // CONVERT subcommand
        .addSubcommand(subcommand =>
            subcommand
                .setName('convert')
                .setDescription('Converts a local time and timezone to the required UTC format.')
                .addStringOption(option =>
                    option.setName('local_time')
                        .setDescription('Your local time (e.g., 14:30)')
                        .setRequired(true)
                        .setMinLength(5)
                        .setMaxLength(5)
                )
                .addStringOption(option =>
                    option.setName('local_timezone')
                        .setDescription('Your timezone (e.g., PST, CET, America/Los_Angeles)')
                        .setRequired(true)
                )
        )
        
        // STATUS subcommand
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Shows the next calculated run time for all active schedules.')
        ),

    async execute(interaction) {
        const startTime = Date.now();
        const subcommand = interaction.options.getSubcommand();
        
        try {
            // Track command usage
            metrics.trackCommand('schedule', interaction.user.id, 0, true);
            
            // Defer reply
            await interaction.deferReply({ ephemeral: true });
            
            // Initialize services
            const timezoneService = new TimezoneConversionService();
            const announcementService = new AnnouncementService();
            const uiService = new ScheduleUIService();
            
            // Handle subcommands
            switch (subcommand) {
                case 'set':
                    await this.handleSetCommand(interaction, announcementService, uiService);
                    break;
                case 'list':
                    await this.handleListCommand(interaction, announcementService, uiService);
                    break;
                case 'delete':
                    await this.handleDeleteCommand(interaction, announcementService, uiService);
                    break;
                case 'convert':
                    await this.handleConvertCommand(interaction, timezoneService, uiService);
                    break;
                case 'status':
                    await this.handleStatusCommand(interaction, announcementService, uiService);
                    break;
                default:
                    throw new ValidationError('Unknown subcommand', 'subcommand');
            }
            
            // Track successful execution
            const executionTime = Date.now() - startTime;
            metrics.trackCommand('schedule', interaction.user.id, executionTime, true);
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            metrics.trackCommand('schedule', interaction.user.id, executionTime, false);
            metrics.trackError(error, 'schedule');
            
            const errorResponse = ErrorHandler.handleError(error, {
                interaction,
                user: interaction.user,
                guild: interaction.guild,
                channel: interaction.channel,
                command: 'schedule'
            });
            
            await interaction.editReply({
                content: errorResponse.userMessage
            });
            
            // Log error
            const logDetails = `Subcommand: ${subcommand}\nError: ${error.message}`;
            await logger.logBotActivity('Schedule Command Error', logDetails, interaction);
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
