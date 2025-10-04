const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { brandingText } = require('../utils/branding.js');

const activeRallyTimers = new Map();
const RALLY_CLEANUP_MARKER = 'Rally Initiated by:';

async function createRally(channel, leader, title, spots, duration = 10, mention = null) {
    let participants = [leader.id];
    const endTime = Math.floor(Date.now() / 1000) + (duration * 60);

    const getRallyEmbed = (isClosed = false, reason = '') => {
        const participantMentions = participants.map(id => `<@${id}>`).join('\n');
        const spotsDisplay = spots ? `(${participants.length}/${spots})` : `(${participants.length})`;

        const embed = new EmbedBuilder()
            .setColor(isClosed ? '#808080' : '#0099ff')
            .setTitle(`⚔️ Rally: ${title}`)
            .setAuthor({ name: `Led by ${leader.user.tag}`, iconURL: leader.user.displayAvatarURL() })
            .addFields(
                { name: `Participants ${spotsDisplay}`, value: participantMentions || 'No one has joined yet.' },
            )
            .setTimestamp();

        if (isClosed) {
            embed.setFooter({ text: `Rally ${reason}` });
        } else {
            embed.setFooter({ text: `Rally starts` })
                 .setTimestamp(endTime * 1000);
        }

        return embed;
    };

    const getButtons = (isClosed = false) => {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('rally_join').setLabel('Join').setStyle(ButtonStyle.Success).setDisabled(isClosed),
                new ButtonBuilder().setCustomId('rally_leave').setLabel('Leave').setStyle(ButtonStyle.Secondary).setDisabled(isClosed),
                new ButtonBuilder().setCustomId('rally_cancel').setLabel('Cancel Rally').setStyle(ButtonStyle.Danger).setDisabled(isClosed)
            );
    };

    const message = await channel.send({
        content: mention ? `${mention}` : null,
        embeds: [getRallyEmbed()],
        components: [getButtons()]
    });

    const collector = message.createMessageComponentCollector({ time: duration * 60 * 1000 });

    collector.on('collect', async i => {
        await i.deferUpdate();

        if (i.customId === 'rally_cancel') {
            if (i.user.id !== leader.id) {
                return i.followUp({ content: 'Only the rally leader can cancel this rally.', ephemeral: true });
            }
            return collector.stop('Canceled');
        }

        const isParticipant = participants.includes(i.user.id);

        if (i.customId === 'rally_join') {
            if (isParticipant) {
                return i.followUp({ content: 'You are already in this rally.', ephemeral: true });
            }
            if (spots && participants.length >= spots) {
                return i.followUp({ content: 'This rally is already full.', ephemeral: true });
            }
            participants.push(i.user.id);
        }

        if (i.customId === 'rally_leave') {
            if (!isParticipant) {
                return i.followUp({ content: 'You are not in this rally.', ephemeral: true });
            }
            if (i.user.id === leader.id) {
                return i.followUp({ content: 'The rally leader cannot leave the rally.', ephemeral: true });
            }
            participants = participants.filter(id => id !== i.user.id);
        }

        await message.edit({ embeds: [getRallyEmbed()] });
    });

    collector.on('end', (collected, reason) => {
        const finalReason = reason === 'time' ? 'Started/Expired' : reason;
        message.edit({
            embeds: [getRallyEmbed(true, finalReason)],
            components: [getButtons(true)]
        });
    });
}

async function handleRallyPing(interaction) {
    await interaction.deferReply();
    const target = interaction.options.getString('target');
    const action = interaction.options.getString('action');
    const initialDuration = interaction.options.getInteger('duration') || 10;
    const targetMention = target.match(/<@&?(\d+)>/);
    if (!targetMention) {
        return interaction.editReply({
            content: `❌ Invalid Target: Please mention a role or a user directly (e.g., \\\`@RoleName\\\\\`).`,
            ephemeral: true 
        });
    }
    const getRallyEmbed = (remainingMinutes, initiator) => {
        const remainingSeconds = remainingMinutes * 60;
        let color, title, timeDisplay;
        if (remainingSeconds <= 0) {
            color = '#808080';
            title = '✅ RALLY ENDED / ACTION COMPLETED';
            timeDisplay = 'Time Expired.';
        } else if (remainingSeconds <= 300) {
            color = '#FF0000';
            title = '🚨 URGENT ACTION REQUIRED! (5 Mins or Less)';
            timeDisplay = `${remainingMinutes} minutes`;
        } else {
            color = '#FFA500';
            title = '⚔️ ALLIANCE COORDINATION ALERT';
            timeDisplay = `${remainingMinutes} minutes`;
        }
        return new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setAuthor({ name: initiator.tag, iconURL: initiator.displayAvatarURL() })
            .setDescription(`**ACTION:** ${action}\n\n**TIME REMAINING:** ${timeDisplay}`)
            .setTimestamp()
            .setFooter({ text: `${RALLY_CLEANUP_MARKER} ${initiator.username} | ${brandingText}` });
    };
    try {
        const message = await interaction.channel.send({
            content: `${target} - **Rally Alert!**`,
            embeds: [getRallyEmbed(initialDuration, interaction.user)]
        });
        let currentDuration = initialDuration;
        const updateRallyTimer = async () => {
            currentDuration--;
            if (currentDuration > 0) {
                await message.edit({ embeds: [getRallyEmbed(currentDuration, interaction.user)] });
                const timeoutId = setTimeout(updateRallyTimer, 60 * 1000);
                activeRallyTimers.set(message.id, timeoutId);
            } else {
                await message.edit({
                    content: `~~${target} - **Rally Alert!**~~`,
                    embeds: [getRallyEmbed(0, interaction.user)]
                });
                activeRallyTimers.delete(message.id);
            }
        };
        const timeoutId = setTimeout(updateRallyTimer, 60 * 1000);
        activeRallyTimers.set(message.id, timeoutId);
        await interaction.editReply({
            content: `✅ Rally Alert sent! The timer for **${initialDuration} minutes** has started and will count down automatically. [Jump to Message](${message.url})`,
            ephemeral: true 
        });
    } catch (error) {
        console.error('Error sending rally ping:', error);
        await interaction.editReply({
            content: `❌ Failed to send rally alert. Check bot permissions to send messages and embed links.`,
            ephemeral: true
        });
    }
}

async function handleRallyClear(interaction) {
    await interaction.deferReply({ ephemeral: true });
    try {
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const messageToDelete = messages.find(m => 
            m.author.id === interaction.client.user.id &&
            m.embeds.length > 0 &&
            m.embeds[0].footer?.text.includes(`${RALLY_CLEANUP_MARKER} ${interaction.user.username}`)
        );
        if (messageToDelete) {
            if (activeRallyTimers.has(messageToDelete.id)) {
                clearTimeout(activeRallyTimers.get(messageToDelete.id));
                activeRallyTimers.delete(messageToDelete.id);
            }
            await messageToDelete.delete();
            await interaction.editReply({ content: '✅ The last rally alert you sent in this channel has been cleared, and its timer has been stopped.' });
        } else {
            await interaction.editReply({ content: '❌ Could not find a recent rally alert sent by you in the last 100 messages of this channel.' });
        }
    } catch (error) {
        console.error('Error clearing rally message:', error);
        await interaction.editReply({
            content: `❌ An error occurred while trying to clear the message. Reason: \\\`${error.message}\\\``,
            ephemeral: true 
        });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rally')
        .setDescription('Alliance coordination commands for rallies and alerts.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Creates an interactive rally with join/leave buttons.')
                .addStringOption(option => option.setName('title').setDescription('The objective of the rally (e.g., "Attack Enemy Base").').setRequired(true))
                .addIntegerOption(option => option.setName('spots').setDescription('Total number of spots available in the rally.').setRequired(false))
                .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes until the rally starts (defaults to 10).').setRequired(false))
                .addRoleOption(option => option.setName('mention').setDescription('Role to ping for this rally.').setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('ping')
                .setDescription('Sends a simple, non-interactive alert with a countdown.')
                .addStringOption(option => option.setName('target').setDescription('The role or user to ping.').setRequired(true))
                .addStringOption(option => option.setName('action').setDescription('The action required.').setRequired(true))
                .addIntegerOption(option => option.setName('duration').setDescription('Time remaining in minutes (max 60).').setRequired(false).setMinValue(1).setMaxValue(60)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Deletes the most recent rally ping/alert sent by you in this channel.')),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        if (subcommand === 'create') {
            await interaction.deferReply({ ephemeral: true });
            const title = interaction.options.getString('title');
            const spots = interaction.options.getInteger('spots');
            const duration = interaction.options.getInteger('duration');
            const mention = interaction.options.getRole('mention');
            createRally(interaction.channel, interaction.member, title, spots, duration, mention);
            await interaction.editReply({ content: 'Rally created successfully!' });
        } else if (subcommand === 'ping') {
            await handleRallyPing(interaction);
        } else if (subcommand === 'clear') {
            await handleRallyClear(interaction);
        }
    },
    createRally,
};