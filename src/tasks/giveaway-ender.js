const Giveaway = require('../database/models.Giveaway');
const { EmbedBuilder } = require('discord.js');

async function endGiveaway(giveaway, client) {
    const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
    if (!channel) {
        giveaway.status = 'ERRORED';
        await giveaway.save();
        return;
    }

    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
    if (!message) {
        giveaway.status = 'ERRORED';
        await giveaway.save();
        return;
    }

    const reaction = message.reactions.cache.get('🎉');
    if (!reaction) {
        // No one entered
        const endedEmbed = new EmbedBuilder(message.embeds[0])
            .setDescription(`Giveaway ended. No one entered.\n**Prize:** ${giveaway.prize}`)
            .setColor('Red');
        await message.edit({ embeds: [endedEmbed] });
        giveaway.status = 'ENDED';
        await giveaway.save();
        return;
    }

    const users = await reaction.users.fetch();
    let entrants = users.filter(user => !user.bot).map(user => user.id);

    if (giveaway.requiredRoleId) {
        const guild = await client.guilds.fetch(giveaway.guildId);
        const members = await guild.members.fetch({ user: entrants });
        entrants = members.filter(member => member.roles.cache.has(giveaway.requiredRoleId)).map(member => member.id);
    }

    if (entrants.length === 0) {
        const endedEmbed = new EmbedBuilder(message.embeds[0])
            .setDescription(`Giveaway ended. No one entered.\n**Prize:** ${giveaway.prize}`)
            .setColor('Red');
        await message.edit({ embeds: [endedEmbed] });
        giveaway.status = 'ENDED';
        await giveaway.save();
        return;
    }

    const winners = [];
    for (let i = 0; i < giveaway.winnerCount && entrants.length > 0; i++) {
        const winnerIndex = Math.floor(Math.random() * entrants.length);
        winners.push(entrants.splice(winnerIndex, 1)[0]);
    }

    giveaway.winners = winners;
    giveaway.status = 'ENDED';
    await giveaway.save();

    const winnerMentions = winners.map(winnerId => `<@${winnerId}>`).join(', ');
    const endedEmbed = new EmbedBuilder(message.embeds[0])
        .setDescription(`Giveaway ended!\n**Prize:** ${giveaway.prize}\n**Winner(s):** ${winnerMentions}`)
        .setColor('Green');

    await message.edit({ embeds: [endedEmbed] });
    await channel.send(`Congratulations ${winnerMentions}! You won the **${giveaway.prize}**!`);

    for (const winnerId of winners) {
        try {
            const winner = await client.users.fetch(winnerId);
            await winner.send(`Congratulations! You won the **${giveaway.prize}** in the giveaway on the **${channel.guild.name}** server!`);
        } catch (error) {
            console.error(`Could not send DM to winner ${winnerId}:`, error);
        }
    }
}

async function endGiveaways(client) {
    const giveaways = await Giveaway.find({ endTime: { $lte: new Date() }, status: 'RUNNING' });

    for (const giveaway of giveaways) {
        await endGiveaway(giveaway, client);
    }
}

module.exports = (client) => {
    setInterval(() => endGiveaways(client), 30 * 1000); // Run every 30 seconds
    console.log('[GiveawayEnder] Background task started.');
};

module.exports.endGiveaway = endGiveaway;
