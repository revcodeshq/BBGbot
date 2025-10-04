const { EmbedBuilder } = require('discord.js');
const Leader = require('../database/models.Leader.js');
const Quote = require('../database/models.Quote.js');
const Announcement = require('../database/models.Announcements.js');
const { brandingText } = require('./branding.js');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));


// Main function to generate the embed
async function generateBotInfoEmbed(client) {
    // --- Gather Stats (using Promise.all for efficiency) ---
    const [ 
        leaderCount,
        quoteCount,
        scheduleCount,
    ] = await Promise.all([
        Leader.countDocuments(),
        Quote.countDocuments(),
        Announcement.countDocuments(),
    ]);

    const uptime = client.uptime;
    const days = Math.floor(uptime / 86400000);
    const hours = Math.floor(uptime / 3600000) % 24;
    const minutes = Math.floor(uptime / 60000) % 60;
    const seconds = Math.floor(uptime / 1000) % 60;
    const uptimeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('🤖 Bot Status & Information')
        .setAuthor({ name: client.user.username, iconURL: client.user.displayAvatarURL() })
        .setDescription('This is a private bot for the BBG Alliance, providing utility and management functions.')
        .addFields(
            { name: '📊 Core Stats', value: `**Uptime:** ${uptimeString}\n**API Latency:** ${client.ws.ping}ms`, inline: true },
            { name: '🗃️ Database', value: `**Leaders:** ${leaderCount}\n**Quotes:** ${quoteCount}\n**Schedules:** ${scheduleCount}`, inline: false }
        )
        .setTimestamp()
        .setFooter({ text: brandingText });

    return embed;
}

module.exports = { generateBotInfoEmbed };
