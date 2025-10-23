/**
 * Reminder Handler
 * Handles reminder creation and scheduling
 */

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const Announcement = require('../database/models.Announcements');
const { validateTimeString, validateChannelName, sanitizeInput } = require('../utils/validators');
const { get } = require('../utils/config');
const { ValidationError, APIError } = require('../utils/error-handler');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

class ReminderHandler {
    /**
     * Handles reminder creation button clicks
     * @param {Object} interaction - Discord interaction object
     */
    static async handleCreateReminder(interaction) {
        const parts = interaction.customId.split('_');
        const description = parts.slice(2, parts.length - 1).join('_');
        const time = parts[parts.length - 1];

        const modal = new ModalBuilder()
            .setCustomId('reminder_modal')
            .setTitle('Create a New Reminder');

        const descriptionInput = new TextInputBuilder()
            .setCustomId('reminder_description')
            .setLabel("What is the event?")
            .setStyle(TextInputStyle.Short)
            .setValue(description)
            .setRequired(true)
            .setMaxLength(200);

        const timeInput = new TextInputBuilder()
            .setCustomId('reminder_time')
            .setLabel("When is the event?")
            .setStyle(TextInputStyle.Short)
            .setValue(time)
            .setRequired(true)
            .setPlaceholder("e.g., 'in 2 hours', 'at 9pm EST', '14:30'");

        const channelInput = new TextInputBuilder()
            .setCustomId('reminder_channel')
            .setLabel("Channel to announce in (e.g., #general)")
            .setStyle(TextInputStyle.Short)
            .setValue(interaction.channel.name)
            .setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(descriptionInput),
            new ActionRowBuilder().addComponents(timeInput),
            new ActionRowBuilder().addComponents(channelInput)
        );

        await interaction.showModal(modal);
    }

    /**
     * Handles reminder modal submission
     * @param {Object} interaction - Discord interaction object
     */
    static async handleReminderModal(interaction) {
        await interaction.deferReply({ flags: 64 });

        const description = sanitizeInput(interaction.fields.getTextInputValue('reminder_description'));
        const timeQuery = sanitizeInput(interaction.fields.getTextInputValue('reminder_time'));
        const channelName = sanitizeInput(interaction.fields.getTextInputValue('reminder_channel')).replace('#', '');

        // Validate inputs
        if (!validateTimeString(timeQuery)) {
            throw new ValidationError('Invalid time format. Please use formats like "in 2 hours", "at 9pm EST", or "14:30".', 'time');
        }

        if (!validateChannelName(channelName)) {
            throw new ValidationError('Invalid channel name format.', 'channel');
        }

        const channel = interaction.guild.channels.cache.find(ch => ch.name === channelName);
        if (!channel || !channel.isTextBased()) {
            throw new ValidationError(`Could not find a text channel named #${channelName}.`, 'channel');
        }

        try {
            // Parse time using AI
            const futureDate = await this.parseTimeWithAI(timeQuery);
            if (!futureDate) {
                throw new ValidationError(`I couldn't understand the time "${timeQuery}". Please be more specific (e.g., "14:30", "in 2 hours").`, 'time');
            }

            const utcHour = futureDate.getUTCHours().toString().padStart(2, '0');
            const utcMinute = futureDate.getUTCMinutes().toString().padStart(2, '0');
            const utcTime = `${utcHour}:${utcMinute}`;

            // Create announcement
            await Announcement.create({
                guildId: interaction.guildId,
                channelId: channel.id,
                time: utcTime,
                interval: 'ONCE',
                content: description,
                authorId: interaction.user.id
            });

            await interaction.editReply({ 
                content: `✅ Reminder set! I will post a message in <#${channel.id}> at **${utcTime} UTC**.` 
            });

        } catch (error) {
            if (error instanceof ValidationError || error instanceof APIError) {
                throw error;
            }
            throw new APIError('An unexpected error occurred while setting the reminder', 'GEMINI_API', error);
        }
    }

    /**
     * Parses time string using AI
     * @param {string} timeQuery - Time query string
     * @returns {Date|null} Parsed date or null if invalid
     */
    static async parseTimeWithAI(timeQuery) {
        const GEMINI_API_KEY = get('api.geminiApiKey');
        if (!GEMINI_API_KEY) {
            throw new Error('Gemini API key not configured');
        }

        const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
        const nowUTC = new Date();
        
        const timeConversionPrompt = `You are a precise time calculation assistant. Your task is to determine the exact future date and time in ISO 8601 format based on a natural language phrase.
The current date and time is exactly ${nowUTC.toISOString()}.
Analyze the user's phrase below and calculate the resulting absolute date and time.

User's phrase: "${timeQuery}"

Your output MUST be only the full ISO 8601 timestamp (YYYY-MM-DDTHH:mm:ss.sssZ) or the word "Error".
- If the phrase is "in 2 hours", calculate the time 2 hours from now and return the full ISO timestamp.
- If the phrase is "at 9pm EST", you must convert it to the correct UTC date and time and return the full ISO timestamp.
- If the phrase is a specific time like "21:00", assume it's for the current day in UTC. If that time has already passed today, assume it's for the next day.
- If a specific time cannot be determined, output the word "Error".`;

        const payload = {
            contents: [{ parts: [{ text: timeConversionPrompt }] }],
            generationConfig: { temperature: 0.0 }
        };

        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        const isoString = result.candidates?.[0]?.content?.parts?.[0]?.text.trim();

        if (!isoString || isoString.toLowerCase() === 'error') {
            return null;
        }

        const futureDate = new Date(isoString);
        if (isNaN(futureDate.getTime())) {
            return null;
        }

        return futureDate;
    }
}

module.exports = ReminderHandler;
