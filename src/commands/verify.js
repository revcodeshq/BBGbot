const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your Whiteout Survival account'),
  async execute(interaction) {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('start_verification')
          .setLabel('Start Verification')
          .setStyle(ButtonStyle.Primary)
      );
    await interaction.reply({ content: 'Click to verify your account:', components: [row], flags: 64 });
  }
};