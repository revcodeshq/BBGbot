/**
 * Poll Handler
 * Handles all poll-related interactions (voting, creation)
 */

const { EmbedBuilder } = require('discord.js');
const Poll = require('../database/models.Poll');

class PollHandler {
    /**
     * Handles poll voting button clicks
     * @param {Object} interaction - Discord interaction object
     */
    static async handlePollVote(interaction) {
        await interaction.deferUpdate();
        
        const [, , optionIndexStr] = interaction.customId.split('_');
        const optionIndex = parseInt(optionIndexStr);

        const poll = await Poll.findOne({ messageId: interaction.message.id });

        if (!poll) {
            return;
        }

        // Check if user already voted
        const voter = poll.voters.find(v => v.userId === interaction.user.id);
        if (voter) {
            await interaction.followUp({ 
                content: 'You have already voted in this poll.', 
                flags: 64 
            });
            return;
        }

        // Add vote
        poll.voters.push({ userId: interaction.user.id, optionIndex });
        await poll.save();

        // Update poll display
        await this.updatePollDisplay(interaction, poll);
    }

    /**
     * Updates the poll embed with current vote counts
     * @param {Object} interaction - Discord interaction object
     * @param {Object} poll - Poll document from database
     */
    static async updatePollDisplay(interaction, poll) {
        const totalVotes = poll.voters.length;
        const optionFields = poll.options.map((option, index) => {
            const voteCount = poll.voters.filter(v => v.optionIndex === index).length;
            const percentage = totalVotes > 0 ? ((voteCount / totalVotes) * 100).toFixed(2) : 0;
            return { 
                name: `${index + 1}. ${option}`, 
                value: `${voteCount} votes (${percentage}%)`, 
                inline: false 
            };
        });

        const pollEmbed = new EmbedBuilder(interaction.message.embeds[0])
            .setFields(optionFields);

        await interaction.message.edit({ embeds: [pollEmbed] });
    }

    /**
     * Creates a new poll
     * @param {Object} interaction - Discord interaction object
     * @param {string} question - Poll question
     * @param {Array} options - Poll options
     * @param {number} duration - Poll duration in milliseconds
     */
    static async createPoll(interaction, question, options, duration) {
        const endTime = new Date(Date.now() + duration);
        
        const pollEmbed = new EmbedBuilder()
            .setTitle(`📊 Poll: ${question}`)
            .setDescription(`React with the numbers below to vote!\n**Ends:** <t:${Math.floor(endTime.getTime() / 1000)}:R>`)
            .setColor(0x5865F2)
            .setTimestamp()
            .setFooter({ text: `Created by ${interaction.user.tag}` });

        // Add option fields
        options.forEach((option, index) => {
            pollEmbed.addFields({
                name: `${index + 1}. ${option}`,
                value: '0 votes (0%)',
                inline: false
            });
        });

        const pollMessage = await interaction.reply({ 
            embeds: [pollEmbed], 
            fetchReply: true 
        });

        // Add reactions
        for (let i = 0; i < options.length; i++) {
            await pollMessage.react(`${i + 1}️⃣`);
        }

        // Save poll to database
        const poll = new Poll({
            guildId: interaction.guild.id,
            channelId: interaction.channel.id,
            messageId: pollMessage.id,
            question,
            options,
            endTime,
            createdBy: interaction.user.id,
            voters: []
        });

        await poll.save();
    }

    /**
     * Ends a poll and announces results
     * @param {Object} poll - Poll document from database
     * @param {Object} client - Discord client
     */
    static async endPoll(poll, client) {
        const channel = await client.channels.fetch(poll.channelId).catch(() => null);
        if (!channel) return;

        const message = await channel.messages.fetch(poll.messageId).catch(() => null);
        if (!message) return;

        const totalVotes = poll.voters.length;
        const results = poll.options.map((option, index) => {
            const voteCount = poll.voters.filter(v => v.optionIndex === index).length;
            const percentage = totalVotes > 0 ? ((voteCount / totalVotes) * 100).toFixed(2) : 0;
            return { option, votes: voteCount, percentage };
        });

        // Find winning option
        const winner = results.reduce((prev, current) => 
            (prev.votes > current.votes) ? prev : current
        );

        const resultsEmbed = new EmbedBuilder()
            .setTitle(`📊 Poll Results: ${poll.question}`)
            .setDescription(`**Winner:** ${winner.option} (${winner.votes} votes - ${winner.percentage}%)\n\n**All Results:**`)
            .setColor(0x00FF00)
            .setTimestamp()
            .setFooter({ text: `Poll ended` });

        results.forEach((result, index) => {
            resultsEmbed.addFields({
                name: `${index + 1}. ${result.option}`,
                value: `${result.votes} votes (${result.percentage}%)`,
                inline: false
            });
        });

        await message.edit({ 
            embeds: [resultsEmbed],
            components: [] // Remove voting buttons
        });

        // Mark poll as ended
        poll.status = 'ENDED';
        await poll.save();
    }
}

module.exports = PollHandler;
