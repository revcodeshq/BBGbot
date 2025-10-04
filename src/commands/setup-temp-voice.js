const { SlashCommandBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const TempVoiceConfig = require('../database/models.TempVoiceConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-temp-voice')
        .setDescription('Sets up the temporary voice channel feature.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addChannelOption(option =>
            option.setName('creator_channel')
                .setDescription('The voice channel users join to create a temporary channel.')
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(true)
        )
        .addChannelOption(option =>
            option.setName('category')
                .setDescription('The category where temporary channels will be created.')
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const creatorChannel = interaction.options.getChannel('creator_channel');
        const category = interaction.options.getChannel('category');

        try {
            await TempVoiceConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                {
                    guildId: interaction.guild.id,
                    creatorChannelId: creatorChannel.id,
                    categoryId: category.id,
                },
                { upsert: true, new: true }
            );

            await interaction.editReply({ content: `✅ Temporary voice channel feature has been set up. Users can now join ${creatorChannel} to create their own channel in the ${category} category.` });

        } catch (error) {
            console.error('Error setting up temp voice config:', error);
            await interaction.editReply({ content: 'An error occurred while setting up the feature.' });
        }
    },
};