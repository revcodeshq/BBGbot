const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const HelpMessage = require('../database/models.HelpMessage');
const { getStaticHelpEmbed } = require('../utils/help');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setuphelp')
        .setDescription('Sets up a persistent help message in a channel.')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to post the help message in.')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');

        if (!channel.isTextBased()) {
            return interaction.reply({ content: 'Please select a text channel.', flags: 64 });
        }

        const helpEmbed = getStaticHelpEmbed();

        try {
            const helpMessage = await channel.send({ embeds: [helpEmbed] });

            await HelpMessage.findOneAndUpdate(
                { guildId: interaction.guild.id },
                {
                    guildId: interaction.guild.id,
                    channelId: channel.id,
                    messageId: helpMessage.id,
                },
                { upsert: true, new: true }
            );

            await interaction.reply({ content: `Persistent help message has been set up in ${channel}.`, flags: 64 });

        } catch (error) {
            console.error('Error setting up help message:', error);
            await interaction.reply({ content: 'An error occurred while setting up the help message.', flags: 64 });
        }
    },
};