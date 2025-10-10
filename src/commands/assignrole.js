const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('assignrole')
    .setDescription('Assign BT1/BT2 roles (Leaders only)')
    .addStringOption(opt => opt.setName('role').setDescription('Role to assign').setRequired(true).addChoices(
      { name: 'BT1', value: 'BT1' },
      { name: 'BT2', value: 'BT2' }
    ))
    .addUserOption(opt => opt.setName('user').setDescription('User to assign role to').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  async execute(interaction) {
    const roleToAssign = interaction.options.getString('role');
    const user = interaction.options.getUser('user');
    const member = interaction.guild.members.cache.get(user.id);

    if (!member) {
      return interaction.reply({ content: 'User not found in this server.', flags: 64 });
    }

    const roleId = roleToAssign === 'BT1' ? process.env.BT1_ROLE_ID : process.env.BT2_ROLE_ID;

    if (!roleId) {
      return interaction.reply({ content: `Role ID for ${roleToAssign} is not configured.`, flags: 64 });
    }

    const role = interaction.guild.roles.cache.get(roleId);

    if (!role) {
      return interaction.reply({ content: `Role ${roleToAssign} not found.`, flags: 64 });
    }

    try {
      await member.roles.add(role);
      await interaction.reply({ content: `Successfully assigned the ${role.name} role to ${user.tag}.` });
    } catch (error) {
      console.error(error);
      await interaction.reply({ content: 'There was an error assigning the role.', flags: 64 });
    }
  }
};