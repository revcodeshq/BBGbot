const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { sanitizeInput } = require('../utils/validators');
const { ErrorHandler } = require('../utils/error-handler');
const { metrics } = require('../utils/metrics');
const logger = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('feedback')
        .setDescription('📝 Submit feedback about the bot to help us improve')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of feedback')
                .setRequired(false)
                .addChoices(
                    { name: '🐛 Bug Report', value: 'bug' },
                    { name: '💡 Feature Request', value: 'feature' },
                    { name: '⭐ General Feedback', value: 'general' },
                    { name: '❓ Question', value: 'question' },
                    { name: '📈 Performance Issue', value: 'performance' }
                )
        ),
    
    // Indicate that this command shows a modal and should not be deferred
    noDefer: true,

    async execute(interaction) {
        try {
            const feedbackType = interaction.options.getString('type') || 'general';

            // Create feedback modal
            const modal = new ModalBuilder()
                .setCustomId(`feedback_modal_${feedbackType}`)
                .setTitle('📝 Bot Feedback');

            const titleInput = new TextInputBuilder()
                .setCustomId('feedback_title')
                .setLabel('Brief Title/Summary')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter a short title for your feedback')
                .setRequired(true)
                .setMaxLength(100);

            const descriptionInput = new TextInputBuilder()
                .setCustomId('feedback_description')
                .setLabel('Detailed Description')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Please provide detailed information about your feedback, bug report, or feature request')
                .setRequired(true)
                .setMaxLength(1000);

            const contactInput = new TextInputBuilder()
                .setCustomId('feedback_contact')
                .setLabel('Contact Info (Optional)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Discord username or email if you want follow-up')
                .setRequired(false)
                .setMaxLength(100);

            const firstActionRow = new ActionRowBuilder().addComponents(titleInput);
            const secondActionRow = new ActionRowBuilder().addComponents(descriptionInput);
            const thirdActionRow = new ActionRowBuilder().addComponents(contactInput);

            modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);

            await interaction.showModal(modal);

            // Track feedback command usage
            metrics.trackCommand('feedback', interaction.user.id, 0, true);

        } catch (error) {
            console.error('Error in feedback command:', error);
            const errorResponse = ErrorHandler.handleError(error, {
                interaction,
                user: interaction.user,
                guild: interaction.guild,
                channel: interaction.channel,
                command: 'feedback'
            });

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: errorResponse.userMessage, ephemeral: true });
            } else {
                await interaction.editReply({ content: errorResponse.userMessage });
            }

            await logger.logBotActivity('Feedback Command Error', error.message, interaction);
        }
    },

    /**
     * Handles feedback modal submission
     * @param {Object} interaction - Modal submit interaction
     */
    async handleFeedbackSubmission(interaction) {
        try {
            const feedbackType = interaction.customId.split('_')[2];
            const title = sanitizeInput(interaction.fields.getTextInputValue('feedback_title'));
            const description = sanitizeInput(interaction.fields.getTextInputValue('feedback_description'));
            const contact = sanitizeInput(interaction.fields.getTextInputValue('feedback_contact') || '');

            // Create feedback embed
            const feedbackEmbed = new EmbedBuilder()
                .setColor(this.getFeedbackColor(feedbackType))
                .setTitle(`📝 ${this.getFeedbackTypeLabel(feedbackType)}`)
                .setAuthor({
                    name: interaction.user.tag,
                    iconURL: interaction.user.displayAvatarURL()
                })
                .addFields(
                    {
                        name: '👤 User',
                        value: `${interaction.user.tag}\n${interaction.user.id}`,
                        inline: true
                    },
                    {
                        name: '🏠 Server',
                        value: interaction.guild ? `${interaction.guild.name}\n${interaction.guild.id}` : 'DM',
                        inline: true
                    },
                    {
                        name: '📊 Type',
                        value: this.getFeedbackTypeLabel(feedbackType),
                        inline: true
                    },
                    {
                        name: '📄 Title',
                        value: title || 'No title provided',
                        inline: false
                    },
                    {
                        name: '📝 Description',
                        value: description || 'No description provided',
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({ text: 'BBG Bot Feedback System' });

            if (contact) {
                feedbackEmbed.addFields({
                    name: '📞 Contact',
                    value: contact,
                    inline: false
                });
            }

            // Try to send to feedback channel if configured
            const feedbackChannelId = process.env.FEEDBACK_CHANNEL_ID;
            if (feedbackChannelId) {
                try {
                    const feedbackChannel = await interaction.guild.channels.fetch(feedbackChannelId);
                    if (feedbackChannel && feedbackChannel.isTextBased()) {
                        await feedbackChannel.send({ embeds: [feedbackEmbed] });
                    }
                } catch (channelError) {
                    console.warn('Could not send feedback to configured channel:', channelError.message);
                }
            }

            // Always log feedback for admin review
            await logger.logBotActivity('User Feedback', {
                type: feedbackType,
                title,
                description,
                contact,
                userId: interaction.user.id,
                guildId: interaction.guild?.id
            }, interaction);

            // Track feedback metrics
            metrics.trackFeedback(feedbackType, interaction.user.id, interaction.guild?.id);

            // Send confirmation to user
            const confirmEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Feedback Submitted!')
                .setDescription('Thank you for your feedback! We appreciate you taking the time to help us improve the bot.')
                .addFields(
                    {
                        name: '📊 Your Feedback',
                        value: `**Type:** ${this.getFeedbackTypeLabel(feedbackType)}\n**Title:** ${title}`,
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({ text: 'BBG Bot • Feedback System' });

            await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

        } catch (error) {
            console.error('Error handling feedback submission:', error);
            const errorResponse = ErrorHandler.handleError(error, {
                interaction,
                user: interaction.user,
                guild: interaction.guild,
                channel: interaction.channel,
                command: 'feedback'
            });

            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: errorResponse.userMessage, ephemeral: true });
            } else {
                await interaction.editReply({ content: errorResponse.userMessage });
            }
        }
    },

    /**
     * Gets color for feedback type
     * @param {string} type - Feedback type
     * @returns {string} Hex color code
     */
    getFeedbackColor(type) {
        const colors = {
            bug: '#ff0000',      // Red for bugs
            feature: '#0099ff',  // Blue for features
            general: '#00ff00',  // Green for general
            question: '#ffff00', // Yellow for questions
            performance: '#ff9900' // Orange for performance
        };
        return colors[type] || '#00ff00';
    },

    /**
     * Gets human-readable label for feedback type
     * @param {string} type - Feedback type
     * @returns {string} Label
     */
    getFeedbackTypeLabel(type) {
        const labels = {
            bug: '🐛 Bug Report',
            feature: '💡 Feature Request',
            general: '⭐ General Feedback',
            question: '❓ Question',
            performance: '📈 Performance Issue'
        };
        return labels[type] || '⭐ General Feedback';
    }
};