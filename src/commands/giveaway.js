const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const Giveaway = require('../database/models.Giveaway');
const { endGiveaway } = require('../tasks/giveaway-ender.js');

const { parseDuration } = require('../utils/duration-parser.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Manages giveaways.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Starts a new giveaway.')
                .addStringOption(option =>
                    option.setName('duration')
                        .setDescription('The duration of the giveaway (e.g., 1h, 2d).')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('winners')
                        .setDescription('The number of winners.')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('prize')
                        .setDescription('The prize of the giveaway.')
                        .setRequired(true)
                )
                .addRoleOption(option =>
                    option.setName('required_role')
                        .setDescription('Specify a role that users must have to be eligible to win.')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reroll')
                .setDescription('Rerolls a giveaway winner.')
                .addStringOption(option =>
                    option.setName('giveaway_id')
                        .setDescription('The message ID of the giveaway to reroll.')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('Ends a giveaway immediately.')
                .addStringOption(option =>
                    option.setName('giveaway_id')
                        .setDescription('The message ID of the giveaway to end.')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const { client } = interaction;

        if (subcommand === 'start') {
            const durationStr = interaction.options.getString('duration');
            const winnerCount = interaction.options.getInteger('winners');
            const prize = interaction.options.getString('prize');
            const requiredRole = interaction.options.getRole('required_role');

            const durationMs = parseDuration(durationStr);
            if (!durationMs) {
                return interaction.reply({ content: 'Invalid duration format. Use s, m, h, or d.', flags: 64 });
            }

            const endTime = new Date(Date.now() + durationMs);

            const description = `React with 🎉 to enter!\n**Prize:** ${prize}\n**Winners:** ${winnerCount}\n**Ends:** <t:${Math.floor(endTime.getTime() / 1000)}:R>${requiredRole ? `\n**Requirement:** ${requiredRole}` : ''}`;

            const giveawayEmbed = new EmbedBuilder()
                .setTitle('🎉 Giveaway! 🎉')
                .setDescription(description)
                .setColor('Gold')
                .setFooter({ text: `Hosted by ${interaction.user.tag}` });

            const giveawayMessage = await interaction.channel.send({ embeds: [giveawayEmbed] });
            await giveawayMessage.react('🎉');

            const giveaway = new Giveaway({
                guildId: interaction.guild.id,
                channelId: interaction.channel.id,
                messageId: giveawayMessage.id,
                prize,
                winnerCount,
                endTime,
                hostedBy: interaction.user.id,
                requiredRoleId: requiredRole ? requiredRole.id : null,
            });

            await giveaway.save();

            await interaction.reply({ content: 'Giveaway started!', flags: 64 });
        } else if (subcommand === 'reroll') {
            const giveawayId = interaction.options.getString('giveaway_id');
            const giveaway = await Giveaway.findOne({ messageId: giveawayId, status: 'ENDED' });

            if (!giveaway) {
                return interaction.reply({ content: 'Could not find an ended giveaway with that message ID.', flags: 64 });
            }

            const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
            if (!channel) {
                return interaction.reply({ content: 'Could not find the giveaway channel.', flags: 64 });
            }

            const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
            if (!message) {
                return interaction.reply({ content: 'Could not find the giveaway message.', flags: 64 });
            }

            const reaction = message.reactions.cache.get('🎉');
            const users = await reaction.users.fetch();
            const entrants = users.filter(user => !user.bot).map(user => user.id);
            const oldWinners = giveaway.winners;
            const possibleWinners = entrants.filter(entrant => !oldWinners.includes(entrant));

            if (possibleWinners.length === 0) {
                return interaction.reply({ content: 'No new entrants to choose from.', flags: 64 });
            }

            const newWinnerIndex = Math.floor(Math.random() * possibleWinners.length);
            const newWinner = possibleWinners[newWinnerIndex];

            giveaway.winners.push(newWinner);
            await giveaway.save();

            await interaction.reply({ content: `Rerolled! The new winner is <@${newWinner}>!` });

        } else if (subcommand === 'end') {
            const giveawayId = interaction.options.getString('giveaway_id');
            const giveaway = await Giveaway.findOne({ messageId: giveawayId, status: 'RUNNING' });

            if (!giveaway) {
                return interaction.reply({ content: 'Could not find a running giveaway with that message ID.', flags: 64 });
            }

            await endGiveaway(giveaway, client);
            await interaction.reply({ content: 'Giveaway ended!', flags: 64 });
        }
    },
};