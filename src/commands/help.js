const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getCommands } = require('../utils/help');

const COMMANDS_PER_PAGE = 5;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Lists all available commands and their descriptions.'),
    async execute(interaction) {
        const commands = getCommands().filter(c => c.name !== 'help'); // Exclude help from the list
        const totalPages = Math.ceil(commands.length / COMMANDS_PER_PAGE);
        let currentPage = 0;

        const generateEmbed = (page) => {
            const start = page * COMMANDS_PER_PAGE;
            const end = start + COMMANDS_PER_PAGE;
            const currentCommands = commands.slice(start, end);

            const embed = new EmbedBuilder()
                .setColor(0x0099FF)
                .setTitle('**BBG Bot Commands**')
                .setDescription(`Page ${page + 1} of ${totalPages}`)
                .setTimestamp();

            for (const command of currentCommands) {
                let value = `> ${command.description}`;
                if (command.options && command.options.length > 0) {
                    const subcommands = command.options.filter(o => o.type === 1 || o.type === 2);
                    if (subcommands.length > 0) {
                        value += '\n**Subcommands:**';
                        for (const subcommand of subcommands) {
                            value += `\n>  - \`${subcommand.name}\`: ${subcommand.description}`;
                        }
                    } else {
                        value += '\n**Options:**';
                        for (const option of command.options) {
                            value += `\n>  - \`${option.name}\`: ${option.description}`;
                        }
                    }
                }
                embed.addFields({ name: `/${command.name}`, value: value, inline: false });
            }
            return embed;
        };

        const generateButtons = (page) => {
            return new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('help_prev')
                        .setLabel('◀ Previous')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page === 0),
                    new ButtonBuilder()
                        .setCustomId('help_next')
                        .setLabel('Next ▶')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(page >= totalPages - 1)
                );
        };

        const initialEmbed = generateEmbed(currentPage);
        const initialButtons = generateButtons(currentPage);

        const message = await interaction.reply({
            embeds: [initialEmbed],
            components: [initialButtons],
            ephemeral: true,
            fetchReply: true,
        });

        const collector = message.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id && (i.customId === 'help_prev' || i.customId === 'help_next'),
            time: 60000, // 60 seconds
        });

        collector.on('collect', async i => {
            if (i.customId === 'help_next') {
                currentPage++;
            } else if (i.customId === 'help_prev') {
                currentPage--;
            }

            const newEmbed = generateEmbed(currentPage);
            const newButtons = generateButtons(currentPage);

            await i.update({
                embeds: [newEmbed],
                components: [newButtons],
            });
        });

        collector.on('end', async () => {
            const finalButtons = generateButtons(currentPage);
            finalButtons.components.forEach(c => c.setDisabled(true));
            await interaction.editReply({ components: [finalButtons] }).catch(() => {}); // Ignore errors if message was deleted
        });
    },
};
