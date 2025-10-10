const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { brandingText } = require('../utils/branding.js');

/**
 * Creates and sends an embed for a user's avatar.
 * @param {import('discord.js').TextChannel} channel The channel to send the avatar in.
 * @param {import('discord.js').User} targetUser The user whose avatar should be shown.
 */
async function showAvatar(channel, targetUser) {
    const avatarURL = targetUser.displayAvatarURL({
        dynamic: true,
        size: 512
    });

    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle(`${targetUser.username}'s Avatar`)
        .setImage(avatarURL)
        .setTimestamp();

    await channel.send({ embeds: [embed] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('avatar')
        .setDescription("Get a user's avatar.")
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user whose avatar you want to see.')
                .setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });
        const targetUser = interaction.options.getUser('user') || interaction.user;

        // Call the core function
        showAvatar(interaction.channel, targetUser);

        await interaction.editReply({ content: 'Avatar has been sent!' });
    },
    showAvatar,
};