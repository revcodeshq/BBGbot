const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const User = require('../database/models.User');
const logger = require('../utils/logger');
const { getFurnaceLevelName } = require('../utils/game-utils.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('adminverify')
    .setDescription('Admin: Verify a user by Discord and FID')
    .addUserOption(opt => opt.setName('user').setDescription('Discord user to verify').setRequired(true))
    .addStringOption(opt => opt.setName('fid').setDescription('Whiteout Survival FID').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const discordUser = interaction.options.getUser('user');
    const fid = interaction.options.getString('fid');
    // Validate FID length
    if (fid.length < 6 || fid.length > 15) {
      await interaction.reply({ content: '❌ FID must be between 6 and 15 characters.', flags: 64 });
      return;
    }
    // Always defer reply first
    await interaction.deferReply({ flags: 64 });
    // Fetch player info from API
    const crypto = require('crypto');
    const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
    const secret = 'tB87#kPtkxqOS2';
    const currentTime = Date.now();
    const baseForm = `fid=${fid}&time=${currentTime}`;
    const sign = crypto.createHash('md5').update(baseForm + secret).digest('hex');
    const fullForm = `sign=${sign}&${baseForm}`;
    let player = null;
    try {
      const response = await fetch('https://wos-giftcode-api.centurygame.com/api/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: fullForm
      });
      const data = await response.json();
      console.log('AdminVerify API response:', data, 'FID:', fid);
      player = data.data;
    } catch (e) {
      await interaction.followUp({ content: '❌ Could not fetch player info from API.', flags: 64 });
      return;
    }
    if (!player || !player.nickname) {
      await interaction.followUp({ content: '❌ No player found for this FID!', flags: 64 });
      return;
    }
    const furnaceLevelName = getFurnaceLevelName(player.stove_lv);
    // Update DB
    await User.findOneAndUpdate(
      { discordId: discordUser.id },
      {
        discordId: discordUser.id,
        gameId: fid,
        nickname: player.nickname,
        furnaceLevel: furnaceLevelName,
        verified: true
      },
      { upsert: true, new: true }
    );
    // Assign Member role & set nickname
    const guild = interaction.guild;
    const member = await guild.members.fetch(discordUser.id);
    const memberRole = guild.roles.cache.get(process.env.MEMBER_ROLE_ID);
    if (memberRole) {
        await member.roles.add(memberRole);
    }

    try {
        let finalNickname = `${player.nickname} | ${furnaceLevelName}`;
        if (finalNickname.length > 32) {
            finalNickname = finalNickname.slice(0, 32);
        }
        await member.setNickname(finalNickname, 'Admin Verification');
    } catch (err) {
        console.warn(`[AdminVerify] Could not set nickname for ${discordUser.tag}: ${err.message}. Bot role may be too low.`);
    }
    // Log action
    await logger.logBotActivity('Admin Verify', `User: <@${discordUser.id}> FID: ${fid} Nickname: ${player.nickname} Furnace: ${furnaceLevelName}`, interaction.client);
    await interaction.followUp({ content: `✅ <@${discordUser.id}> has been verified and assigned Member role.`, flags: 64 });
  }
};
