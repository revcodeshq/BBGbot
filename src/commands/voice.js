const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const TempVoiceConfig = require('../database/models.TempVoiceConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('voice')
        .setDescription('Manages your temporary voice channel.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('invite')
                .setDescription('Invites a user to your channel.')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to invite.')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('lock')
                .setDescription('Locks your channel.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('unlock')
                .setDescription('Unlocks your channel.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('rename')
                .setDescription('Renames your channel.')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('The new name for your channel.')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('limit')
                .setDescription('Sets the user limit for your channel.')
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('The new user limit for your channel (0 for unlimited).')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const { member, guild } = interaction;
        const subcommand = interaction.options.getSubcommand();

        const config = await TempVoiceConfig.findOne({ guildId: guild.id });
        if (!config) {
            return interaction.reply({ content: 'The temporary voice channel feature is not configured on this server.', flags: 64 });
        }

        const tempChannelData = config.tempChannels.find(c => c.ownerId === member.id);
        if (!tempChannelData) {
            return interaction.reply({ content: 'You do not own a temporary voice channel.', flags: 64 });
        }

        const channel = guild.channels.cache.get(tempChannelData.channelId);
        if (!channel) {
            return interaction.reply({ content: 'Your temporary voice channel could not be found.', flags: 64 });
        }

        if (subcommand === 'invite') {
            const user = interaction.options.getUser('user');
            await channel.permissionOverwrites.edit(user, {
                ViewChannel: true,
                Connect: true,
            });
            await interaction.reply({ content: `Invited ${user} to your channel.`, flags: 64 });
        } else if (subcommand === 'lock') {
            await channel.permissionOverwrites.edit(guild.roles.everyone, {
                Connect: false,
            });
            await interaction.reply({ content: 'Channel locked.', flags: 64 });
        } else if (subcommand === 'unlock') {
            await channel.permissionOverwrites.edit(guild.roles.everyone, {
                Connect: true,
            });
            await interaction.reply({ content: 'Channel unlocked.', flags: 64 });
        } else if (subcommand === 'rename') {
            const newName = interaction.options.getString('name');
            await channel.setName(newName);
            await interaction.reply({ content: `Channel renamed to ${newName}.`, flags: 64 });
        } else if (subcommand === 'limit') {
            const newLimit = interaction.options.getInteger('limit');
            if (newLimit < 0 || newLimit > 99) {
                return interaction.reply({ content: 'User limit must be between 0 and 99.', flags: 64 });
            }
            await channel.setUserLimit(newLimit);
            await interaction.reply({ content: `Channel user limit set to ${newLimit}.`, flags: 64 });
        }
    },
};