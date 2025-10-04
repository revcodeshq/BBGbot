const Poll = require('../database/models.Poll');
const { EmbedBuilder, ActionRowBuilder } = require('discord.js');

async function endPolls(client) {
    const polls = await Poll.find({ endTime: { $lte: new Date() }, status: 'RUNNING' });

    for (const poll of polls) {
        const channel = await client.channels.fetch(poll.channelId).catch(() => null);
        if (!channel) {
            poll.status = 'ERRORED';
            await poll.save();
            continue;
        }

        const message = await channel.messages.fetch(poll.messageId).catch(() => null);
        if (!message) {
            poll.status = 'ERRORED';
            await poll.save();
            continue;
        }

        const totalVotes = poll.voters.length;
        const optionFields = poll.options.map((option, index) => {
            const voteCount = poll.voters.filter(v => v.optionIndex === index).length;
            const percentage = totalVotes > 0 ? ((voteCount / totalVotes) * 100).toFixed(2) : 0;
            return { name: `${index + 1}. ${option}`, value: `${voteCount} votes (${percentage}%)`, inline: false };
        });

        const pollEmbed = new EmbedBuilder(message.embeds[0])
            .setDescription('Poll has ended. Here are the final results:')
            .setFields(optionFields);

        const components = message.components.map(row => {
            const newRow = new ActionRowBuilder();
            row.components.forEach(component => {
                newRow.addComponents(component.setDisabled(true));
            });
            return newRow;
        });

        await message.edit({ embeds: [pollEmbed], components });

        poll.status = 'ENDED';
        await poll.save();
    }
}

module.exports = (client) => {
    setInterval(() => endPolls(client), 30 * 1000); // Run every 30 seconds
    console.log('[PollEnder] Background task started.');
};
