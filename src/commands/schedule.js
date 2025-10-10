// Discord Imports
const {
    SlashCommandBuilder,
    EmbedBuilder,
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

// Database/Utility Imports
const Announcement = require('../database/models.Announcements');
const DisplayMessage = require('../database/models.DisplayMessage');
const logger = require('../utils/logger');
const { brandingText } = require('../utils/branding.js');
const { get } = require('../utils/config');

// --- Gemini API Configuration ---
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent`;
// NOTE: API Key is left as an empty string. The environment will provide it at runtime.
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
/**
 * Implements exponential backoff for API retries.
 * @param {Function} fn - The function to retry (must return a Promise).
 * @param {number} maxRetries - Maximum number of retries.
 * @returns {Promise<any>}
 */
const exponentialBackoff = async (fn, maxRetries = 3) => {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) {
                throw error;
            }
            const delay = Math.pow(2, i) * 1000 + Math.floor(Math.random() * 1000);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

/**
 * Calls the Gemini API with Google Search grounding to convert timezones.
 * @param {string} query - The specific conversion query (e.g., "Convert 14:30 EST to 24-hour UTC format").
 * @returns {Promise<{text: string, sources: Array<{uri: string, title: string}>}>}
 */
const fetchTimeConversion = async (query) => {
    const systemPrompt = "You are a precise time and timezone conversion bot. Given a local time and timezone, your ONLY response must be the resulting time in 24-hour UTC format (HH:MM). Do not add any extra words, explanation, or punctuation. If conversion is impossible, respond with 'Error'.";
    
    const payload = {
        contents: [{ parts: [{ text: query }] }],
        // Enable Google Search grounding for accurate, real-time timezone data
        tools: [{ "google_search": {} }],
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
    };

    const apiUrlWithKey = `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`;
    
    const apiCall = async () => {
        const response = await fetch(apiUrlWithKey, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`API call failed with status ${response.status}: ${errorBody}`);
        }

        const result = await response.json();
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            const text = candidate.content.parts[0].text.trim();
            
            // Extract grounding sources
            let sources = [];
            const groundingMetadata = candidate.groundingMetadata;
            if (groundingMetadata && groundingMetadata.groundingAttributions) {
                sources = groundingMetadata.groundingAttributions
                    .map(attribution => ({
                        uri: attribution.web?.uri,
                        title: attribution.web?.title,
                    }))
                    .filter(source => source.uri && source.title);
            }
            return { text, sources };
        }
        throw new Error("Gemini response was missing content.");
    };

    return exponentialBackoff(apiCall);
};


// Define valid intervals and their descriptions
const intervalChoices = [
    { name: 'Once-Time Send', value: 'ONCE' },
    { name: 'Daily', value: 'DAILY' },
    { name: 'Weekly', value: 'WEEKLY' },
    { name: 'Custom Days Interval', value: 'CUSTOM_DAYS' },
    { name: 'Custom Weeks Interval', value: 'CUSTOM_WEEKS' },
];

// Helper function to map interval codes to readable names for the list embed
const getIntervalDisplayName = (ann) => {
    switch (ann.interval) {
        case 'ONCE':
            return 'One-Time';
        case 'DAILY':
            return 'Daily';
        case 'WEEKLY':
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return `Weekly (Every ${days[ann.dayOfWeek]})`;
        case 'CUSTOM_DAYS':
            return `Every ${ann.daysInterval} Days`;
        case 'CUSTOM_WEEKS':
            return `Every ${ann.weeksInterval} Weeks`;
        default:
            return ann.interval;
    }
};

/**
 * Calculates the next run time metadata for display and sorting.
 * Note: This uses simplified date logic based on the current UTC time and is intended for display/sorting, 
 * not for precise scheduling execution.
 * @param {object} ann - The announcement document.
 * @param {Date} now - The current time in UTC.
 * @returns {object} { sortKey: number, nextRunString: string }
 */
const calculateNextRunTimeMetadata = (ann, now) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const [targetHour, targetMinute] = ann.time.split(':').map(Number);
    
    // Base Sort Key: Time of day in minutes (0 to 1439). Lower is sooner.
    let sortKey = targetHour * 60 + targetMinute; 
    let nextRunString = "";

    if (ann.interval === 'ONCE') {
        if (ann.lastSent) {
            nextRunString = "Already Sent";
            sortKey = 999999; // Push sent items to the very end of the list
        } else {
            const targetTimeInMinutes = targetHour * 60 + targetMinute;
            const nowTimeInMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();

            if (targetTimeInMinutes <= nowTimeInMinutes) {
                // Time has passed today. It's pending until the next check (which is likely soon).
                nextRunString = `Pending (Time passed today) at ${ann.time} UTC`;
                sortKey += 1440; // Sort after all upcoming runs (1 day in minutes)
            } else {
                 // Time is still in the future today
                 nextRunString = `Today at ${ann.time} UTC`;
                 sortKey += 0;
            }
        }
    } else { // Recurring intervals
        const nowDay = now.getUTCDay(); // 0 (Sunday) - 6 (Saturday)
        
        if (ann.interval === 'WEEKLY') {
            const targetDay = ann.dayOfWeek;
            let daysUntilNextRun = 0;

            if (targetDay === nowDay) {
                // Same day, check if time has passed
                if (sortKey <= (now.getUTCHours() * 60 + now.getUTCMinutes())) {
                    daysUntilNextRun = 7; // Time passed, run is next week
                } 
            } else if (targetDay > nowDay) {
                daysUntilNextRun = targetDay - nowDay;
            } else {
                daysUntilNextRun = 7 - (nowDay - targetDay);
            }

            nextRunString = `Next: ${days[targetDay]} at ${ann.time} UTC`;
            sortKey += daysUntilNextRun * 1440; // Add time for days
            
        } else if (ann.interval === 'DAILY') {
            // Daily: check if time has passed today
             if (sortKey <= (now.getUTCHours() * 60 + now.getUTCMinutes())) {
                nextRunString = `Tomorrow at ${ann.time} UTC`;
                sortKey += 1440; // Tomorrow's time
            } else {
                nextRunString = `Today at ${ann.time} UTC`;
            }
        } else { // Custom intervals: Too complex for simple date math. Just state recurrence.
            nextRunString = `Next Run: ${getIntervalDisplayName(ann)} at ${ann.time} UTC`;
            sortKey += 2 * 1440; // Push after daily/weekly runs for clarity
        }
    }

    return { sortKey, nextRunString };
};

/**
 * Calculates the precise Date object for the next run time.
 * @param {object} ann - The announcement document.
 * @param {Date} now - The current time in UTC.
 * @returns {Date|null} - The Date object for the next run, or null if not easily calculable.
 */
const calculateNextRunDate = (ann, now) => {
    const [targetHour, targetMinute] = ann.time.split(':').map(Number);
    const nextRun = new Date(now);
    nextRun.setUTCHours(targetHour, targetMinute, 0, 0);

    if (ann.interval === 'ONCE') {
        if (nextRun < now) return null; // Time has passed
        return nextRun;
    }

    if (ann.interval === 'DAILY') {
        if (nextRun < now) {
            nextRun.setUTCDate(nextRun.getUTCDate() + 1);
        }
        return nextRun;
    }

    if (ann.interval === 'WEEKLY') {
        const targetDay = ann.dayOfWeek;
        const nowDay = now.getUTCDay();
        let dayDifference = targetDay - nowDay;

        if (dayDifference < 0) {
            dayDifference += 7;
        } else if (dayDifference === 0 && nextRun < now) {
            dayDifference = 7;
        }
        
        nextRun.setUTCDate(nextRun.getUTCDate() + dayDifference);
        return nextRun;
    }
    
    // Return null for custom intervals as they are harder to predict without more state.
    return null; 
};

/**
 * Generates an array of EmbedBuilders for the list of announcements.
 * @param {Array<Announcement>} announcements 
 * @param {Guild} guild 
 * @returns {Array<EmbedBuilder>}
 */
const createScheduleListEmbeds = (announcements, guild) => {
    const embeds = [];
    let currentDescription = '';
    let counter = 1;
    // Leaving a safe buffer for the description limit (4096 characters)
    const MAX_LENGTH = 3500; 
    
    // Sort by time just for clean display
    announcements.sort((a, b) => (a.time > b.time) ? 1 : -1);

    for (const ann of announcements) {
        // Resolve channel and role names for display
        const channelName = guild.channels.cache.get(ann.channelId)?.name || 'Unknown Channel';
        const intervalName = getIntervalDisplayName(ann);

        // Truncate content for a clean list preview (80 characters max)
        const contentPreview = ann.content.substring(0, 80) + (ann.content.length > 80 ? '...' : '');

        const item = `\n**${counter}.** 
${ann.time} UTC | **${intervalName}**\n` + 
                     `> **Message Preview:** *${contentPreview}*\n` + 
                     `> Channel: <#${ann.channelId}> (\n${channelName}\n)
` + 
                     `> Role: ${ann.roleId ? `<@&${ann.roleId}>` : 'None'}\n` + 
                     `> ID: 
${ann._id}
`;
        
        if ((currentDescription.length + item.length) > MAX_LENGTH) {
            // Push the current embed and start a new one
            embeds.push(new EmbedBuilder()
                .setTitle(`📅 Active Schedules (Page ${embeds.length + 1})`)
                .setDescription(currentDescription)
                .setColor(0x1E90FF) // Dodger Blue for list
                .setTimestamp()
.setFooter({ text: `Total Schedules: ${announcements.length}. Use /schedule delete <ID> to remove. | ${brandingText}` })
            );
            currentDescription = '';
        }

        currentDescription += item;
        counter++;
    }

    // Push the final embed if it has content
    if (currentDescription.length > 0) {
        embeds.push(new EmbedBuilder()
            .setTitle(`📅 Active Schedules (Page ${embeds.length + 1} of ${embeds.length + 1})`)
            .setDescription(currentDescription)
            .setColor(0x1E90FF) // Dodger Blue for list
            .setTimestamp()
            .setFooter({ text: `Total Schedules: ${announcements.length}. Use /schedule delete <ID> to remove.` })
        );
    }

    return embeds;
};

/**
 * Generates paginated embeds for the status command.
 * @param {Array} scheduledRuns - The sorted list of upcoming runs.
 * @returns {Array<EmbedBuilder>}
 */
const createStatusListEmbeds = (scheduledRuns) => {
    const embeds = [];
    const runsPerPage = 10;

    if (scheduledRuns.length === 0) {
        embeds.push(new EmbedBuilder()
            .setTitle('⏰ Upcoming Scheduled Announcements')
            .setDescription("All one-time schedules have already been sent, or there are no immediate upcoming recurring schedules found.")
            .setColor(0x8A2BE2)
            .setTimestamp()
        );
        return embeds;
    }

    for (let i = 0; i < scheduledRuns.length; i += runsPerPage) {
        const currentPageRuns = scheduledRuns.slice(i, i + runsPerPage);
        const page = Math.floor(i / runsPerPage) + 1;
        const totalPages = Math.ceil(scheduledRuns.length / runsPerPage);

        const description = currentPageRuns.map((run, index) => {
            const contentPreview = run.content.substring(0, 50) + (run.content.length > 50 ? '...' : '');
            return `**${i + index + 1}.** [${getIntervalDisplayName(run)}] **${run.nextRunString}**\n` + 
                   `> Channel: <#${run.channelId}> | Content: *${contentPreview}*\n` + 
                   `> ID: 
${run._id}
`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
            .setTitle('⏰ Upcoming Scheduled Announcements')
            .setDescription(description)
            .setColor(0x8A2BE2) // Blue Violet
            .setTimestamp()
            .setFooter({ text: brandingText });
        
        embeds.push(embed);
    }

    return embeds;
};


/**
 * Helper function to create the confirmation embed for the 'set' subcommand.
 */
const createConfirmationEmbed = (time, interval, message, channel, role, dayOfWeek, daysInterval, weeksInterval) => {
    // Build a summary for the recurrence field
    let scheduleSummary = interval;
    if (interval === 'WEEKLY') {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        scheduleSummary = `Weekly (Every ${days[dayOfWeek]})`;
    }
    if (interval === 'CUSTOM_DAYS') {
        scheduleSummary = `Custom Interval (Every ${daysInterval} days)`;
    }
    if (interval === 'CUSTOM_WEEKS') {
        scheduleSummary = `Custom Interval (Every ${weeksInterval} weeks)`;
    }

    return new EmbedBuilder()
        .setTitle('❓ Confirm Scheduled Announcement Details')
        .setDescription(`Please review the schedule details below before confirming. **Note:** The time provided is in **UTC** (Coordinated Universal Time). If you need help converting, use 
/schedule convert
.`) 
        .setColor(0xFFD700) // Gold for confirmation/warning
        .addFields(
            { 
                name: '📝 Message Content', 
                value: message.substring(0, 1024), 
                inline: false 
            }, 
            { name: '🕒 Launch Time (UTC)', value: `
${time}
`, inline: true },
            { name: '🔄 Recurrence', value: scheduleSummary, inline: true },
            { name: '📍 Destination Channel', value: `<#${channel.id}>`, inline: true },
            { name: '📌 Role Mention', value: role ? `<@&${role.id}>` : 'None', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: brandingText });
};


module.exports = {
    // Command definition
    data: new SlashCommandBuilder()
        .setName('schedule')
        .setDescription('Manages scheduled announcements.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        // --- SET SUBCOMMAND ---
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
                        .addChoices(...intervalChoices)
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
                        .setDescription('Required for WEEKLY: 0=Sun, 1=Mon, 6=Sat.')
                        .setRequired(false)
                        .setMinValue(0)
                        .setMaxValue(6)
                )
                .addIntegerOption(option =>
                    option.setName('days_interval')
                        .setDescription('Required for CUSTOM_DAYS: Number of days between announcements.')
                        .setRequired(false)
                        .setMinValue(2)
                        .setMaxValue(365)
                )
                .addIntegerOption(option =>
                    option.setName('weeks_interval')
                        .setDescription('Required for CUSTOM_WEEKS: Number of weeks between announcements.')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(52)
                )
        )
        // --- MODIFY SUBCOMMAND ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('modify')
                .setDescription('Modifies an existing scheduled announcement by its ID. Provide only the fields you want to change.')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('The MongoDB ID of the announcement to modify.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('time')
                        .setDescription('New time (e.g., 14:30). MUST be in 24-hour UTC format.')
                        .setRequired(false)
                        .setMinLength(5)
                        .setMaxLength(5)
                )
                .addStringOption(option =>
                    option.setName('interval')
                        .setDescription('New recurrence interval.')
                        .setRequired(false) 
                        .addChoices(...intervalChoices)
                )
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('The new message content for the announcement.')
                        .setRequired(false)
                        .setMaxLength(1900)
                )
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The new channel where the announcement should be sent.')
                        .setRequired(false)
                )
                .addRoleOption(option =>
                    option.setName('mention_role')
                        .setDescription('Optional new role to mention with the announcement.')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option.setName('day_of_week')
                        .setDescription('Required for WEEKLY: 0=Sun, 1=Mon, 6=Sat.')
                        .setRequired(false)
                        .setMinValue(0)
                        .setMaxValue(6)
                )
                .addIntegerOption(option =>
                    option.setName('days_interval')
                        .setDescription('Required for CUSTOM_DAYS: Number of days between announcements.')
                        .setRequired(false)
                        .setMinValue(2)
                        .setMaxValue(365)
                )
                .addIntegerOption(option =>
                    option.setName('weeks_interval')
                        .setDescription('Required for CUSTOM_WEEKS: Number of weeks between announcements.')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(52)
                )
        )
        // --- DELETE SUBCOMMAND ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Deletes a scheduled announcement by its database ID.')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('The MongoDB ID of the announcement to delete.')
                        .setRequired(true)
                )
        )
        // --- LIST SUBCOMMAND ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lists all active scheduled announcements in this guild.')
        )
        // --- CONVERT SUBCOMMAND ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('convert')
                .setDescription('Converts a local time and timezone to the required UTC format (e.g., 14:30 EST).')
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
        // --- STATUS SUBCOMMAND ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Shows the next calculated run time for all active schedules.')
        )
        // --- DISPLAY SUBCOMMAND ---
        .addSubcommand(subcommand =>
            subcommand
                .setName('display')
                .setDescription('Posts a public embed of the upcoming event schedule to a designated channel.')
        ),

    // Command execution
    async execute(interaction) {
        // Defer the reply ephemerally at the very beginning to avoid interaction timeout errors.
        await interaction.deferReply({ flags: 64 });

        if (!interaction.guild || !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.editReply({ content: 'You do not have permission to manage schedules.' });
        }

        const subcommand = interaction.options.getSubcommand();

        // --- CONVERT SCHEDULE LOGIC (Uses Gemini API) ---
        if (subcommand === 'convert') {
            const localTime = interaction.options.getString('local_time');
            const localTimezone = interaction.options.getString('local_timezone');
            
            // Time format validation (HH:MM)
            if (!/^\d{2}:\d{2}$/.test(localTime) || parseInt(localTime.substring(0, 2)) > 23 || parseInt(localTime.substring(3, 5)) > 59) {
                return interaction.editReply({ content: 'Invalid time format for `local_time`. Please use HH:MM (24-hour).' });
            }

            // The query is made highly specific to guide the LLM to a clean HH:MM UTC output
            const query = `${localTime} ${localTimezone} to 24-hour UTC`;

            try {
                // Call Gemini API with Google Search grounding
                const { text: utcTime, sources } = await fetchTimeConversion(query);
                
                const cleanUTCTime = utcTime.trim();

                // Validate if the response is a clean HH:MM format (as requested in the system prompt)
                if (cleanUTCTime.toLowerCase() === 'error' || !/^\d{2}:\d{2}$/.test(cleanUTCTime)) {
                    throw new Error(`The model could not determine the precise HH:MM UTC time. Result: "${utcTime}"`);
                }

                let sourceFooters = "";
                if (sources.length > 0) {
                    sourceFooters = "\n\n**Sources:**\n" + sources.slice(0, 3).map(s => `- [${s.title}](${s.uri})`).join('\n');
                }

                const conversionEmbed = new EmbedBuilder()
                    .setTitle(`⏱️ Timezone Conversion Success!`)
                    .setDescription(`**Query:** 
${localTime} ${localTimezone}
 converted to UTC.`) 
                    .addFields(
                        {
                            name: `Resulting UTC Time`,
                            value: `The time required for the 
/schedule set
 command is: **
${cleanUTCTime}
**`, 
                            inline: false 
                        }
                    )
                    .setColor(0x00BFFF) // Deep Sky Blue
                    .setFooter({ text: `Conversion powered by Gemini + Google Search.${sourceFooters.length > 0 ? " (See sources below)" : ""}` })
                    .setTimestamp();
                
                if (sourceFooters.length > 0) {
                    conversionEmbed.setDescription(conversionEmbed.data.description + sourceFooters);
                    conversionEmbed.setFooter({ text: `Conversion powered by Gemini + Google Search.` });
                }

                await interaction.editReply({ embeds: [conversionEmbed], content: `Conversion complete.` });

            } catch (error) {
                console.error('Error performing timezone conversion:', error);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Conversion Error')
                    .setDescription(`Failed to convert time. Please check the timezone format or try again.

${error.message}`)
                    .setColor(0xFF0000)
                    .setTimestamp()
                    .setFooter({ text: brandingText });
                await interaction.editReply({ embeds: [errorEmbed], content: " " });
            }
            return;
        }
        
        // --- STATUS SCHEDULE LOGIC ---
        if (subcommand === 'status') {
            try {
                const announcements = await Announcement.find({ guildId: interaction.guildId }).sort({ time: 1 });
                
                if (announcements.length === 0) {
                    const noScheduleEmbed = new EmbedBuilder()
                        .setTitle('📅 No Active Schedules')
                        .setDescription('There are no active scheduled announcements for this server. Use `/schedule set` to create one.')
                        .setColor(0xFFA500)
                        .setTimestamp();
                    return interaction.editReply({ embeds: [noScheduleEmbed] });
                }

                const now = new Date();
                const scheduledRuns = [];

                for (const ann of announcements) {
                    const metadata = calculateNextRunTimeMetadata(ann, now);
                    
                    if (metadata.sortKey < 999999) {
                        scheduledRuns.push({
                            ...ann.toObject(),
                            sortKey: metadata.sortKey,
                            nextRunString: metadata.nextRunString
                        });
                    }
                }

                scheduledRuns.sort((a, b) => a.sortKey - b.sortKey);

                const embeds = createStatusListEmbeds(scheduledRuns);
                await interaction.editReply({ embeds });
                
            } catch (error) {
                logger.error(`[Schedule/Status] Failed to generate status: ${error.message}`, error);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Status Error')
                    .setDescription(`Failed to generate the schedule status: 
${error.message}`)
                    .setColor(0xFF0000)
                    .setTimestamp();
                await interaction.editReply({ embeds: [errorEmbed], content: " " });
            }
            return;
        }

        // --- DISPLAY SCHEDULE LOGIC ---
        if (subcommand === 'display') {
            try {
                const announcements = await Announcement.find({ guildId: interaction.guildId });

                const now = new Date();
                const upcomingEvents = [];

                for (const ann of announcements) {
                    const nextRunDate = calculateNextRunDate(ann, now);
                    if (nextRunDate) { // Only include events with a calculable next run time
                        upcomingEvents.push({
                            ...ann.toObject(),
                            nextRunDate: nextRunDate
                        });
                    }
                }

                // Sort by the actual date object
                upcomingEvents.sort((a, b) => a.nextRunDate - b.nextRunDate);

                // Get event channel from configuration
                const eventChannelId = get('channels.eventSchedule');
                if (!eventChannelId) {
                    return interaction.editReply({ content: 'Event schedule channel is not configured. Please set EVENT_SCHEDULE_CHANNEL_ID in your environment variables.' });
                }
                
                const eventChannel = interaction.guild.channels.cache.get(eventChannelId);
                if (!eventChannel || !eventChannel.isTextBased()) {
                    return interaction.editReply({ content: `The event channel with ID ${eventChannelId} was not found or is not a text channel.` });
                }

                // Delete the old message if it exists
                const existingDisplay = await DisplayMessage.findOne({ guildId: interaction.guildId });
                if (existingDisplay) {
                    try {
                        const oldChannel = await interaction.guild.channels.fetch(existingDisplay.channelId);
                        const oldMessage = await oldChannel.messages.fetch(existingDisplay.messageId);
                        await oldMessage.delete();
                    } catch (error) {
                        logger.warn(`[Schedule/Display] Could not delete old display message for guild ${interaction.guildId}: ${error.message}`);
                    }
                }

                const eventEmbed = new EmbedBuilder()
                    .setTitle('✨ Upcoming Alliance Events ✨')
                    .setColor(0xFFD700) // Gold
                    .setThumbnail('https://www.freeiconspng.com/uploads/calendar-icon-png-28.png')
                    .setTimestamp()
                    .setFooter({ text: 'This board is automatically updated.', iconURL: interaction.guild.iconURL() });

                if (upcomingEvents.length === 0) {
                    eventEmbed.setDescription('There are no upcoming events scheduled right now. Check back later!');
                } else {
                    eventEmbed.setDescription(`Here are our next two upcoming events! Last Update: <t:${Math.floor(Date.now() / 1000)}:R>`);
                    
                    // Take the top 2 events
                    upcomingEvents.slice(0, 2).forEach((event, index) => {
                        const eventTimestamp = Math.floor(event.nextRunDate.getTime() / 1000);
                        const contentPreview = event.content.substring(0, 1000) + (event.content.length > 1000 ? '...' : '');

                        eventEmbed.addFields({
                            name: `🗓️ ${getIntervalDisplayName(event)} Event #${index + 1}`,
                            value: `\n**Starts:** <t:${eventTimestamp}:F> (<t:${eventTimestamp}:R>)\n\n` +
                                   `**Channel:** <#${event.channelId}>\n\n` +
                                   `**Details:**\n>>> ${contentPreview}`
                        });
                    });
                }


                const sentMessage = await eventChannel.send({ embeds: [eventEmbed] });

                // Save the new message ID for future updates
                await DisplayMessage.findOneAndUpdate(
                    { guildId: interaction.guildId },
                    { channelId: eventChannelId, messageId: sentMessage.id },
                    { upsert: true, new: true }
                );

                await interaction.editReply({ content: `✅ Successfully posted the event schedule to <#${eventChannelId}>.` });

            } catch (error) {
                console.error(`[Schedule/Display] Failed to create event display: ${error.message}`, error);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Display Error')
                    .setDescription(`Failed to generate the event display: 
${error.message}`)
                    .setColor(0xFF0000)
                    .setTimestamp();
                await interaction.editReply({ embeds: [errorEmbed], content: " " });
            }
            return;
        }

        // --- LIST SCHEDULE LOGIC ---
        if (subcommand === 'list') {
            try {
                const announcements = await Announcement.find({ guildId: interaction.guildId });
                
                if (announcements.length === 0) {
                    const noScheduleEmbed = new EmbedBuilder()
                        .setTitle('📅 No Active Schedules')
                        .setDescription('There are no active scheduled announcements for this server. Use `/schedule set` to create one.')
                        .setColor(0xFFA500)
                        .setTimestamp();
                    return interaction.editReply({ embeds: [noScheduleEmbed] });
                }

                const embeds = createScheduleListEmbeds(announcements, interaction.guild);
                
                await interaction.editReply({
                    content: `Found **${announcements.length}** active scheduled announcements.`, 
                    embeds: embeds
                });

            } catch (error) {
                logger.error(`[Schedule/List] Failed to fetch announcements for Guild ${interaction.guildId}: ${error.message}`, error);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Database Error')
                    .setDescription(`Failed to fetch schedules from the database: 
${error.message}`)
                    .setColor(0xFF0000);
                await interaction.editReply({ embeds: [errorEmbed] });
            }
            return;
        }

        // --- DELETE SCHEDULE LOGIC ---
        if (subcommand === 'delete') {
            const announcementId = interaction.options.getString('id');
            try {
                const result = await Announcement.deleteOne({
                    _id: announcementId, 
                    guildId: interaction.guildId 
                });

                if (result.deletedCount === 0) {
                    return interaction.editReply({
                        content: `❌ Schedule with ID 
${announcementId}
 not found in this server. Please check the ID using 
/schedule list
.` 
                    });
                }

                const successEmbed = new EmbedBuilder()
                    .setTitle('🗑️ Schedule Deleted')
                    .setDescription(`The scheduled announcement with ID 
${announcementId}
 has been successfully deleted.`) 
.setTimestamp()
.setFooter({ text: brandingText });
                
                await interaction.editReply({ embeds: [successEmbed] });

            } catch (error) {
                logger.error(`[Schedule/Delete] Failed to delete announcement ID ${announcementId}: ${error.message}`, error);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Deletion Error')
                    .setDescription(`Failed to delete schedule with ID 
${announcementId}
: 
${error.message}`)
                    .setColor(0xFF0000)
                    .setFooter({ text: brandingText });
                await interaction.editReply({ embeds: [errorEmbed] });
            }
            return;
        }

        // --- MODIFY SCHEDULE LOGIC ---
        if (subcommand === 'modify') {
            const announcementId = interaction.options.getString('id');
            const newTime = interaction.options.getString('time');
            const newInterval = interaction.options.getString('interval');
            const newMessage = interaction.options.getString('message');
            const newChannel = interaction.options.getChannel('channel');
            const newRole = interaction.options.getRole('mention_role');
            const newDayOfWeek = interaction.options.getInteger('day_of_week');
            const newDaysInterval = interaction.options.getInteger('days_interval');
            const newWeeksInterval = interaction.options.getInteger('weeks_interval');

            try {
                // 1. Find existing announcement
                const announcement = await Announcement.findOne({
                    _id: announcementId, 
                    guildId: interaction.guildId 
                });

                if (!announcement) {
                    return interaction.editReply({
                        content: `❌ Schedule with ID 
${announcementId}
 not found in this server. Nothing was modified.` 
                    });
                }

                // 2. Prepare update object and determine effective interval
                const update = {};
                const effectiveInterval = newInterval || announcement.interval;
                let hasChanges = false;

                // Validate and update time
                if (newTime) {
                    if (!/^\d{2}:\d{2}$/.test(newTime) || parseInt(newTime.substring(0, 2)) > 23 || parseInt(newTime.substring(3, 5)) > 59) {
                        return interaction.editReply({ content: 'Invalid new time format. Please use HH:MM (24-hour UTC).' });
                    }
                    update.time = newTime;
                    hasChanges = true;
                }
                
                // Validate and update interval
                if (newInterval) {
                    update.interval = newInterval;
                    hasChanges = true;
                }

                // Validate interval-specific requirements based on the effective interval
                if (effectiveInterval === 'WEEKLY') {
                    const dayToUse = newDayOfWeek !== null ? newDayOfWeek : announcement.dayOfWeek;
                    if (dayToUse === undefined || dayToUse === null) {
                        return interaction.editReply({ content: 'Modifying to WEEKLY requires the `day_of_week` option (0-6).' });
                    }
                    update.dayOfWeek = dayToUse;
                    if (newDayOfWeek !== null) hasChanges = true;
                } else if (effectiveInterval === 'CUSTOM_DAYS') {
                    const daysToUse = newDaysInterval !== null ? newDaysInterval : announcement.daysInterval;
                    if (daysToUse === undefined || daysToUse === null) {
                        return interaction.editReply({ content: 'Modifying to CUSTOM_DAYS requires the `days_interval` option (min 2).' });
                    }
                    update.daysInterval = daysToUse;
                    if (newDaysInterval !== null) hasChanges = true;
                } else if (effectiveInterval === 'CUSTOM_WEEKS') {
                    const weeksToUse = newWeeksInterval !== null ? newWeeksInterval : announcement.weeksInterval;
                    if (weeksToUse === undefined || weeksToUse === null) {
                        return interaction.editReply({ content: 'Modifying to CUSTOM_WEEKS requires the `weeks_interval` option (min 1).' });
                    }
                    update.weeksInterval = weeksToUse;
                    if (newWeeksInterval !== null) hasChanges = true;
                }
                
                // Other fields
                if (newMessage) { update.content = newMessage; hasChanges = true; }
                if (newChannel) { 
                    if (!newChannel.isTextBased()) {
                        return interaction.editReply({ content: 'The selected channel must be a text-based channel.' });
                    }
                    update.channelId = newChannel.id; 
                    hasChanges = true; 
                }
                // Allow unsetting the role
                if (interaction.options.getRole('mention_role') !== undefined) {
                    update.roleId = newRole ? newRole.id : null;
                    hasChanges = true;
                }
                
                if (!hasChanges) {
                    return interaction.editReply({
                        content: `⚠️ No valid changes detected for schedule ID 
${announcementId}
. Please provide at least one option to modify.`
                    });
                }

                // Reset lastSent if changing time or interval, forcing a check on next run
                if (update.time || update.interval) {
                    update.lastSent = null;
                }

                // 3. Update in DB (using findByIdAndUpdate)
                const updatedAnnouncement = await Announcement.findByIdAndUpdate(
                    announcementId, 
                    { $set: update }, 
                    { new: true } // Return the updated document
                );

                // 4. Success reply
                const successEmbed = new EmbedBuilder()
                    .setTitle('✏️ Schedule Modified Successfully!')
                    .setDescription(`The scheduled announcement with ID 
${announcementId}
 has been updated.`) 
                    .setColor(0x3CB371) // Medium Sea Green
                    .addFields(
                        { name: 'New Time (UTC)', value: `
${updatedAnnouncement.time}
`, inline: true },
                        { name: 'New Interval', value: getIntervalDisplayName(updatedAnnouncement), inline: true },
                        { name: 'New Channel', value: `<#${updatedAnnouncement.channelId}>`, inline: true }
                    )
                    .setTimestamp();
                
                await interaction.editReply({ embeds: [successEmbed] });

            } catch (error) {
                logger.error(`[Schedule/Modify] Failed to modify announcement ID ${announcementId}: ${error.message}`, error);
                const errorEmbed = new EmbedBuilder()
                    .setTitle('❌ Modification Error')
                    .setDescription(`Failed to modify schedule with ID 
${announcementId}
: 
${error.message}`)
                    .setColor(0xFF0000)
                    .setFooter({ text: brandingText });
                await interaction.editReply({ embeds: [errorEmbed] });
            }
            return;
        }

        // --- SET SCHEDULE LOGIC ---
        if (subcommand === 'set') {
            const time = interaction.options.getString('time');
            const interval = interaction.options.getString('interval');
            const message = interaction.options.getString('message');
            const channel = interaction.options.getChannel('channel');
            const role = interaction.options.getRole('mention_role');
            const dayOfWeek = interaction.options.getInteger('day_of_week');
            const daysInterval = interaction.options.getInteger('days_interval');
            const weeksInterval = interaction.options.getInteger('weeks_interval');

            // Time format validation (HH:MM)
            if (!/^\d{2}:\d{2}$/.test(time) || parseInt(time.substring(0, 2)) > 23 || parseInt(time.substring(3, 5)) > 59) {
                return interaction.editReply({ content: 'Invalid time format. Please use HH:MM (24-hour UTC).' });
            }

            // Interval-specific validation
            if (interval === 'WEEKLY' && dayOfWeek === null) {
                return interaction.editReply({ content: 'The WEEKLY interval requires the `day_of_week` option (0=Sunday to 6=Saturday).' });
            }
            if (interval === 'CUSTOM_DAYS' && daysInterval === null) {
                return interaction.editReply({ content: 'The CUSTOM_DAYS interval requires the `days_interval` option (minimum 2 days).' });
            }
            if (interval === 'CUSTOM_WEEKS' && weeksInterval === null) {
                return interaction.editReply({ content: 'The CUSTOM_WEEKS interval requires the `weeks_interval` option (minimum 1 week).' });
            }

            // Ensure channel is text-based
            if (!channel.isTextBased()) {
                return interaction.editReply({ content: 'The selected channel must be a text-based channel.' });
            }
            
            // 1. Create Confirmation UI
            const confirmationEmbed = createConfirmationEmbed(time, interval, message, channel, role, dayOfWeek, daysInterval, weeksInterval);

            const confirmButton = new ButtonBuilder()
                .setCustomId('schedule_confirm')
                .setLabel('Confirm and Schedule')
                .setStyle(ButtonStyle.Success);

            const cancelButton = new ButtonBuilder()
                .setCustomId('schedule_cancel')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger);

            const actionRow = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

            // Send the confirmation message
            const confirmationReply = await interaction.editReply({
                content: 'Please review and confirm the schedule details below:', 
                embeds: [confirmationEmbed], 
                components: [actionRow],
                fetchReply: true 
            });

            // 2. Await Button Click
            const filter = i => i.user.id === interaction.user.id;
            const collector = confirmationReply.createMessageComponentCollector({ filter, time: 60000, max: 1 }); // 60 seconds timeout

            collector.on('collect', async i => {
                await i.deferUpdate(); // Acknowledge the button press
                
                // Disable the buttons immediately for the final message
                const disabledRow = new ActionRowBuilder().addComponents(
                    confirmButton.setDisabled(true),
                    cancelButton.setDisabled(true)
                );

                if (i.customId === 'schedule_confirm') {
                    try {
                        // DB Save Logic
                        const announcement = new Announcement({
                            guildId: interaction.guildId,
                            channelId: channel.id,
                            time: time,
                            interval: interval,
                            content: message,
                            roleId: role ? role.id : null,
                            dayOfWeek: interval === 'WEEKLY' ? dayOfWeek : undefined,
                            daysInterval: interval === 'CUSTOM_DAYS' ? daysInterval : undefined,
                            weeksInterval: interval === 'CUSTOM_WEEKS' ? weeksInterval : undefined,
                            lastSent: null,
                            authorId: interaction.user.id 
                        });

                        await announcement.save();

                        // --- Professional Success Embed ---
                        const successEmbed = new EmbedBuilder()
                            .setTitle('✅ Announcement Scheduled Successfully!')
                            .setDescription(`Your message is now scheduled and will launch in **${channel.name}**.`) 
                            .addFields(
                                { name: 'ID', value: `
${announcement._id.toString()}
`, inline: false },
                                { name: 'Time (UTC)', value: `
${announcement.time}
`, inline: true },
                                { name: 'Interval', value: getIntervalDisplayName(announcement), inline: true }
                            )
                            .setColor(0x32CD32) // Lime Green
                            .setTimestamp();

                        await interaction.editReply({
                            content: 'Schedule confirmed!', 
                            embeds: [successEmbed], 
                            components: [disabledRow] 
                        });

                    } catch (error) {
                        logger.error(`[Schedule/Set] Failed to save announcement for Guild ${interaction.guildId}: ${error.message}`, error);
                        const errorEmbed = new EmbedBuilder()
                            .setTitle('❌ Schedule Save Failed')
                            .setDescription(`An error occurred while saving the schedule: 
${error.message}`)
                            .setColor(0xFF0000);

                        await interaction.editReply({
                            content: 'Save failed.', 
                            embeds: [errorEmbed], 
                            components: [disabledRow] 
                        });
                    }
                } else if (i.customId === 'schedule_cancel') {
                    // Handle cancel
                    await interaction.editReply({
                        content: '❌ Scheduled announcement creation cancelled.',
                        embeds: [], 
                        components: [disabledRow] 
                    });
                }
            });

            // 3. Handle Collector Timeout/End
            collector.on('end', collected => {
                if (collected.size === 0) {
                    // Interaction expired without confirmation
                    const disabledRow = new ActionRowBuilder().addComponents(
                        confirmButton.setDisabled(true),
                        cancelButton.setDisabled(true)
                    );
                    // Only update if the reply hasn't been modified by a successful confirm/cancel
                    interaction.editReply({
                        content: 'Confirmation timed out (60 seconds). Scheduled announcement creation cancelled.', 
                        components: [disabledRow]
                    }).catch(() => logger.debug('Attempted to edit an already edited/deleted confirmation reply.'));
                }
            });

            return;
        }
    },
};
