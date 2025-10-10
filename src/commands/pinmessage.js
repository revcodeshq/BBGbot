const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { brandingText } = require('../utils/branding.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pinmessage')
        .setDescription('Creates and pins an informational embed message in the current channel.')
        .addStringOption(option =>
            option.setName('title')
                .setDescription('The title of the embed message.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('The main content of the embed message.')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle(title)
            .setDescription(description)
            .setFooter({ text: brandingText });

        try {
            const message = await interaction.channel.send({ embeds: [embed] });
            await message.pin();
            await interaction.reply({ content: 'The message has been sent and pinned.', flags: 64 });
        } catch (error) {
            console.error('Failed to send or pin message:', error);
            await interaction.reply({ content: 'There was an error sending or pinning the message.', flags: 64 });
        }
    },
};