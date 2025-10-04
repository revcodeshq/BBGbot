const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const Leader = require('../database/models.Leader');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const crypto = require('crypto');


module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaders')
        .setDescription('Manage the alliance leader list.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a leader to the list.')
                .addUserOption(option => option.setName('user').setDescription('The Discord user to add.').setRequired(true))
                .addStringOption(option => option.setName('fid').setDescription('The in-game FID of the user.').setRequired(true))
                .addStringOption(option => option.setName('alliance').setDescription('The alliance name.').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a leader from the list.')
                .addUserOption(option => option.setName('user').setDescription('The Discord user to remove.').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all alliance leaders.')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        // Make the 'list' subcommand public
        if (subcommand !== 'list' && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        if (subcommand === 'add') {
            await interaction.deferReply({ ephemeral: true });
            const user = interaction.options.getUser('user');
            const fid = interaction.options.getString('fid');
            const alliance = interaction.options.getString('alliance');

            try {
                // Fetch player info from API to get the correct in-game name
                const secret = process.env.WOS_API_SECRET || 'tB87#kPtkxqOS2';
                const currentTime = Date.now();
                const baseForm = `fid=${fid}&time=${currentTime}`;
                const sign = crypto.createHash('md5').update(baseForm + secret).digest('hex');
                const fullForm = `sign=${sign}&${baseForm}`;
                
                const response = await fetch('https://wos-giftcode-api.centurygame.com/api/player', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: fullForm
                });
                const data = await response.json();

                if (!data.data || !data.data.nickname) {
                    return interaction.editReply({ content: '❌ Could not find a player with that FID.' });
                }
                const inGameName = data.data.nickname;

                await Leader.findOneAndUpdate(
                    { discordId: user.id },
                    {
                        discordId: user.id,
                        gameId: fid,
                        inGameName: inGameName,
                        alliance: alliance,
                    },
                    { upsert: true, new: true }
                );

                await interaction.editReply({ content: `✅ **${user.tag}** has been added to the **${alliance}** leader list as **${inGameName}**.` });

            } catch (error) {
                console.error("Error adding leader:", error);
                await interaction.editReply({ content: 'An error occurred while adding the leader.' });
            }

        } else if (subcommand === 'remove') {
            await interaction.deferReply({ ephemeral: true });
            const user = interaction.options.getUser('user');

            try {
                const result = await Leader.deleteOne({ discordId: user.id });
                if (result.deletedCount > 0) {
                    await interaction.editReply({ content: `✅ **${user.tag}** has been removed from the leader list.` });
                } else {
                    await interaction.editReply({ content: `⚠️ **${user.tag}** was not found in the leader list.` });
                }
            } catch (error) {
                console.error("Error removing leader:", error);
                await interaction.editReply({ content: 'An error occurred while removing the leader.' });
            }

        } else if (subcommand === 'list') {
            await interaction.deferReply();
            try {
                const leaders = await Leader.find().sort({ alliance: 1 });
                if (leaders.length === 0) {
                    return interaction.editReply({ content: 'There are no leaders configured.' });
                }

                const embed = new EmbedBuilder()
                    .setTitle('⚔️ Alliance Leadership ⚔️')
                    .setColor('#FFD700') // Gold
                    .setTimestamp();

                const leadersByAlliance = leaders.reduce((acc, leader) => {
                    if (!acc[leader.alliance]) {
                        acc[leader.alliance] = [];
                    }
                    acc[leader.alliance].push(leader);
                    return acc;
                }, {});

                for (const alliance in leadersByAlliance) {
                    const leaderList = leadersByAlliance[alliance].map(leader => 
                        `**Discord:** <@${leader.discordId}>
` +
                        `**In-Game Name:** ${leader.inGameName}
` +
                        `**FID:** 
${leader.gameId}`
                    ).join('\n\n');
                    embed.addFields({ name: `__${alliance}__`, value: leaderList });
                }

                await interaction.editReply({ embeds: [embed] });

            } catch (error) {
                console.error("Error listing leaders:", error);
                await interaction.editReply({ content: 'An error occurred while fetching the leader list.' });
            }
        }
    },
};