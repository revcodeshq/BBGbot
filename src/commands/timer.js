const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Timer = require('../database/models.Timer');
const { brandingText } = require('../utils/branding.js');

/**
 * Parses a duration string (e.g., "1d 2h 30m") into milliseconds.
 * @param {string} durationString The string to parse.
 * @returns {number|null} The duration in milliseconds, or null if invalid.
 */
function parseDuration(durationString) {
    const regex = /(?:(\d+)d)?\s*(?:(\d+)h)?\s*(?:(\d+)m)?/i;
    const matches = durationString.match(regex);

    if (!matches) {
        return null;
    }

    const days = parseInt(matches[1] || '0', 10);
    const hours = parseInt(matches[2] || '0', 10);
    const minutes = parseInt(matches[3] || '0', 10);

    if (days === 0 && hours === 0 && minutes === 0) {
        return null;
    }

    const totalMilliseconds = (days * 24 * 60 * 60 * 1000) + (hours * 60 * 60 * 1000) + (minutes * 60 * 1000);
    return totalMilliseconds;
}

/**
 * Creates a new timer in the database.
 * @param {import('discord.js').User} user The user setting the timer.
 * @param {string} guildId The ID of the guild.
 * @param {string} channelId The ID of the channel.
 * @param {string} timerName The name for the timer.
 * @param {string} durationString The duration string (e.g., "1h 30m").
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function setTimer(user, guildId, channelId, timerName, durationString) {
    const durationMs = parseDuration(durationString);

    if (!durationMs) {
        return { success: false, message: '❌ **Invalid Duration Format!** Please use a format like `1d 2h 30m`, `1h`, or `45m`.' };
    }

    const endTime = new Date(Date.now() + durationMs);

    try {
        const existingTimer = await Timer.findOne({ userId: user.id, timerName });
        if (existingTimer) {
            return { success: false, message: `❌ You already have a timer with the name **${timerName}**. Please choose a different name or clear the existing one.` };
        }

        await Timer.create({
            userId: user.id,
            guildId,
            channelId,
            endTime,
            timerName,
        });

        return { success: true, message: `✅ **Timer Set!**\nI will send you a DM when your timer for **"${timerName}"** is complete.\n\n**Ends:** <t:${Math.floor(endTime.getTime() / 1000)}:R>` };

    } catch (error) {
        console.error("Error setting timer:", error);
        return { success: false, message: 'An error occurred while setting your timer.' };
    }
}

async function handleSetTimer(interaction) {
    // ...existing code...

    const durationString = interaction.options.getString('duration');
    const name = interaction.options.getString('name');
    
    const result = await setTimer(interaction.user, interaction.guild.id, interaction.channel.id, name, durationString);

    await interaction.editReply({ content: result.message });
}

async function handleListTimers(interaction) {
    // ...existing code...

    try {
        const userTimers = await Timer.find({ userId: interaction.user.id }).sort({ endTime: 'asc' });

        if (userTimers.length === 0) {
            return interaction.editReply({ content: "You don't have any active timers." });
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`${interaction.user.username}'s Active Timers`)
            .setTimestamp()
            .setFooter({ text: brandingText });

        const description = userTimers.map(timer => {
            return `**Name:** 
${timer.timerName}
**Ends:** <t:${Math.floor(timer.endTime.getTime() / 1000)}:R>`;
        }).join('\n\n');

        embed.setDescription(description);

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error("Error listing timers:", error);
        await interaction.editReply({ content: 'An error occurred while fetching your timers.' });
    }
}

async function handleClearTimer(interaction) {
    // ...existing code...
    const name = interaction.options.getString('name');

    try {
        const result = await Timer.deleteOne({ userId: interaction.user.id, timerName: name });

        if (result.deletedCount > 0) {
            await interaction.editReply({ content: `✅ Your timer named **"${name}"** has been successfully cleared.` });
        } else {
            await interaction.editReply({ content: `❌ Could not find an active timer with the name **"${name}"**. Use 
/timer list to see your active timers.` });
        }
    } catch (error) {
        console.error("Error clearing timer:", error);
        await interaction.editReply({ content: 'An error occurred while clearing your timer.' });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('timer')
        .setDescription('Manage your personal timers and reminders.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Set a personal timer. The bot will DM you when it\'s done.')
                .addStringOption(option =>
                    option.setName('duration')
                        .setDescription('Duration (e.g., "1d 2h 30m", "1h", "45m").')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('A name for your timer (e.g., "Building Upgrade", "Troop Training").')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('See all your active timers.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear one of your active timers.')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The name of the timer to clear. Use /timer list to see names.')
                        .setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'set') {
            await handleSetTimer(interaction);
        } else if (subcommand === 'list') {
            await handleListTimers(interaction);
        } else if (subcommand === 'clear') {
            await handleClearTimer(interaction);
        }
    },
    setTimer, // Export the core function
};