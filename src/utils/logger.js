/**
 * Logger utility for bot actions and verification attempts
 * Automatically sends formatted embeds to designated logging channels
 */
const { EmbedBuilder } = require('discord.js');
const { brandingText } = require('./branding.js');

module.exports = {
  /**
   * Logs user verification attempts to the verification-logs channel
   * @param {Object} user - Discord user object
   * @param {Object} details - Verification details (fid, nickname, furnaceLevel)
   * @param {Object} clientOrInteraction - Discord client or interaction object
   */
  async logVerification(user, details, clientOrInteraction) {
    // Send embed/log to #✅-verification-logs
    if (!clientOrInteraction) return;
    let guild;
    if (typeof clientOrInteraction.guild !== 'undefined' && clientOrInteraction.guild) {
      guild = clientOrInteraction.guild;
    } else if (typeof clientOrInteraction.guilds !== 'undefined' && clientOrInteraction.guilds) {
      guild = clientOrInteraction.guilds.cache.get(process.env.GUILD_ID);
    }
    if (!guild) return;
    const channel = guild.channels.cache.find(ch => ch.name.includes('verification-logs') && ch.isTextBased());
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setTitle('Verification Attempt')
      .setDescription(`User: <@${user.id}>\nFID: ${details.fid}\nNickname: **${details.nickname}**\nFurnace Level: **${details.furnaceLevel}**`)
      .setColor(0x00ff99)
      .setTimestamp()
      .setFooter({ text: brandingText });
    await channel.send({ embeds: [embed] });
  },
  
  /**
   * Logs general bot activities to the bot-activity channel
   * @param {string} action - Description of the action performed
   * @param {string} details - Additional details about the action
   * @param {Object} clientOrInteraction - Discord client or interaction object
   */
  async logBotActivity(action, details, clientOrInteraction) {
    // Send embed/log to #📝-bot-activity
    if (!clientOrInteraction) return;
    let guild;
    if (typeof clientOrInteraction.guild !== 'undefined' && clientOrInteraction.guild) {
      guild = clientOrInteraction.guild;
    } else if (typeof clientOrInteraction.guilds !== 'undefined' && clientOrInteraction.guilds) {
      guild = clientOrInteraction.guilds.cache.get(process.env.GUILD_ID);
    }
    if (!guild) return;
    const channel = guild.channels.cache.find(ch => ch.name.includes('bot-activity') && ch.isTextBased());
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setTitle('Bot Action')
      .setDescription(`Action: **${action}**\nDetails: ${details}`)
      .setColor(0x1e90ff)
      .setTimestamp()
      .setFooter({ text: brandingText });
    await channel.send({ embeds: [embed] });
  }
};