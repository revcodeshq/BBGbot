const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const BotInfoMessage = require('../database/models/BotInfoMessage');
const { generateBotInfoEmbed } = require('../utils/bot-info.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-bot-info')
        .setDescription('Sets up the persistent bot information embed.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to post the info message in.')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });
        const channel = interaction.options.getChannel('channel');

        if (!channel.isTextBased()) {
            return interaction.editReply({ content: 'Please select a text channel.' });
        }

        try {
            const infoEmbed = await generateBotInfoEmbed(interaction.client);
            const infoMessage = await channel.send({ embeds: [infoEmbed] });

            await BotInfoMessage.findOneAndUpdate(
                { guildId: interaction.guild.id },
                {
                    guildId: interaction.guild.id,
                    channelId: channel.id,
                    messageId: infoMessage.id,
                },
                { upsert: true, new: true }
            );

            await interaction.editReply({ content: `✅ Persistent bot info message has been set up in ${channel}.` });

        } catch (error) {
            console.error('Error setting up bot info message:', error);
            await interaction.editReply({ content: 'An error occurred while setting up the info message.' });
        }
    },
};