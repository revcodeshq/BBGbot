const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

function getCommands() {
    const commands = [];
    const commandsPath = path.join(__dirname, '../commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if (command.data) {
            commands.push(command.data);
        }
    }
    return commands;
}

function getStaticHelpEmbed() {
    const commands = getCommands();
    const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('**BBG Bot Commands**')
        .setDescription("Hello! I'm BBG Bot, your assistant for all things related to the alliance. Here are my available commands:")
        .setTimestamp();

    for (const command of commands) {
        if (command.name === 'help' || command.name === 'setuphelp') continue; // Don't list help commands in the static help
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
        embed.addFields({ name: `\`/${command.name}\``, value, inline: false });
    }
    return embed;
}


module.exports = { getCommands, getStaticHelpEmbed };
