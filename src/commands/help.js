const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { getCommands } = require('../utils/help');
const InteractionHandler = require('../utils/interaction-handler');
const { performanceMonitor } = require('../utils/performance-monitor');
const { advancedCache } = require('../utils/advanced-cache');

// Command categories for better organization
const COMMAND_CATEGORIES = {
    '🎮 Game Commands': ['playerinfo', 'redeem', 'schedule'],
    '⚙️ Utility Commands': ['help', 'ping', 'uptime'],
    '📊 Admin Commands': ['metrics', 'announce', 'poll'],
    '🔧 Moderation': ['kick', 'ban', 'timeout'],
    '🎯 Fun Commands': ['meme', 'joke', 'quote'],
    '📝 Information': ['serverinfo', 'userinfo', 'roleinfo']
};

const COMMANDS_PER_PAGE = 6;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('📚 Interactive help system with command categories and detailed information')
        .addStringOption(option =>
            option.setName('command')
                .setDescription('Get detailed help for a specific command')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Show commands from a specific category')
                .setRequired(false)
                .addChoices(
                    { name: '🎮 Game Commands', value: 'game' },
                    { name: '⚙️ Utility Commands', value: 'utility' },
                    { name: '📊 Admin Commands', value: 'admin' },
                    { name: '🔧 Moderation', value: 'moderation' },
                    { name: '🎯 Fun Commands', value: 'fun' },
                    { name: '📝 Information', value: 'info' }
                )
        ),

    async execute(interaction) {
        await InteractionHandler.executeCommand(interaction, async (interaction) => {
            const specificCommand = interaction.options.getString('command');
            const category = interaction.options.getString('category');
            
            if (specificCommand) {
                await this.showCommandDetails(interaction, specificCommand);
            } else if (category) {
                await this.showCategoryCommands(interaction, category);
            } else {
                await this.showMainHelp(interaction);
            }
        });
    },

    async showCommandDetails(interaction, commandName) {
        const commands = getCommands();
        const command = commands.find(c => c.name === commandName);
        
        if (!command) {
            await interaction.editReply({
                content: `❌ Command \`/${commandName}\` not found. Use \`/help\` to see all available commands.`
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle(`📖 Command: /${command.name}`)
            .setDescription(command.description)
            .addFields(
                {
                    name: '📋 Usage',
                    value: `\`/${command.name}${this.getUsageString(command)}\``,
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({ text: 'BBG Bot Help System' });

        if (command.options && command.options.length > 0) {
            const optionsText = command.options.map(option => {
                const required = option.required ? ' (Required)' : ' (Optional)';
                return `**${option.name}**: ${option.description}${required}`;
            }).join('\n');
            
            embed.addFields({
                name: '⚙️ Options',
                value: optionsText,
                inline: false
            });
        }

        // Add examples if available
        const examples = this.getCommandExamples(command.name);
        if (examples.length > 0) {
            embed.addFields({
                name: '💡 Examples',
                value: examples.join('\n'),
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    async showCategoryCommands(interaction, category) {
        const categoryMap = {
            'game': '🎮 Game Commands',
            'utility': '⚙️ Utility Commands',
            'admin': '📊 Admin Commands',
            'moderation': '🔧 Moderation',
            'fun': '🎯 Fun Commands',
            'info': '📝 Information'
        };

        const categoryName = categoryMap[category];
        const commands = getCommands().filter(c => 
            COMMAND_CATEGORIES[categoryName]?.includes(c.name)
        );

        if (commands.length === 0) {
            await interaction.editReply({
                content: `❌ No commands found in the ${categoryName} category.`
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle(categoryName)
            .setDescription(`Commands in this category (${commands.length} total)`)
            .setTimestamp()
            .setFooter({ text: 'BBG Bot Help System' });

        commands.forEach(command => {
            embed.addFields({
                name: `/${command.name}`,
                value: command.description,
                inline: true
            });
        });

        await interaction.editReply({ embeds: [embed] });
    },

    async showMainHelp(interaction) {
        const commands = getCommands().filter(c => c.name !== 'help');
        const totalPages = Math.ceil(commands.length / COMMANDS_PER_PAGE);
        let currentPage = 0;
        let currentCategory = 'all';

        const generateEmbed = (page, category = 'all') => {
            let filteredCommands = commands;
            
            if (category !== 'all') {
                const categoryMap = {
                    'game': '🎮 Game Commands',
                    'utility': '⚙️ Utility Commands',
                    'admin': '📊 Admin Commands',
                    'moderation': '🔧 Moderation',
                    'fun': '🎯 Fun Commands',
                    'info': '📝 Information'
                };
                const categoryName = categoryMap[category];
                filteredCommands = commands.filter(c => 
                    COMMAND_CATEGORIES[categoryName]?.includes(c.name)
                );
            }

            const totalFilteredPages = Math.ceil(filteredCommands.length / COMMANDS_PER_PAGE);
            const start = page * COMMANDS_PER_PAGE;
            const end = start + COMMANDS_PER_PAGE;
            const currentCommands = filteredCommands.slice(start, end);

            const embed = new EmbedBuilder()
                .setColor(0x0099ff)
                .setTitle('📚 BBG Bot Help System')
                .setDescription(`**Page ${page + 1} of ${totalFilteredPages}** • ${filteredCommands.length} commands`)
                .addFields(
                    {
                        name: '🔍 Quick Actions',
                        value: '• Use `/help command:<name>` for detailed info\n• Use `/help category:<name>` for category view\n• Use buttons below to navigate',
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({ 
                    text: `BBG Bot • Use /help command:<name> for details • Page ${page + 1}/${totalFilteredPages}` 
                });

            if (currentCommands.length === 0) {
                embed.addFields({
                    name: '❌ No Commands',
                    value: 'No commands found for the selected category.',
                    inline: false
                });
            } else {
                for (const command of currentCommands) {
                    const category = this.getCommandCategory(command.name);
                    embed.addFields({
                        name: `/${command.name} ${category}`,
                        value: command.description,
                        inline: true
                    });
                }
            }

            return embed;
        };

        const generateComponents = (page, category = 'all') => {
            const components = [];
            
            // Category selector
            const categorySelect = new StringSelectMenuBuilder()
                .setCustomId('help_category')
                .setPlaceholder('📂 Select Category')
                .addOptions([
                    { label: '📚 All Commands', value: 'all', description: 'Show all available commands' },
                    { label: '🎮 Game Commands', value: 'game', description: 'Game-related commands' },
                    { label: '⚙️ Utility Commands', value: 'utility', description: 'Utility and helper commands' },
                    { label: '📊 Admin Commands', value: 'admin', description: 'Administrative commands' },
                    { label: '🔧 Moderation', value: 'moderation', description: 'Moderation tools' },
                    { label: '🎯 Fun Commands', value: 'fun', description: 'Fun and entertainment' },
                    { label: '📝 Information', value: 'info', description: 'Information commands' }
                ]);

            components.push(new ActionRowBuilder().addComponents(categorySelect));

            // Navigation buttons
            const navButtons = new ActionRowBuilder()
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
                        .setDisabled(page >= Math.ceil(commands.length / COMMANDS_PER_PAGE) - 1),
                    new ButtonBuilder()
                        .setCustomId('help_refresh')
                        .setLabel('🔄 Refresh')
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId('help_close')
                        .setLabel('❌ Close')
                        .setStyle(ButtonStyle.Danger)
                );

            components.push(navButtons);
            return components;
        };

        const initialEmbed = generateEmbed(currentPage, currentCategory);
        const initialComponents = generateComponents(currentPage, currentCategory);

        const message = await interaction.editReply({
            embeds: [initialEmbed],
            components: initialComponents
        });

        const collector = message.createMessageComponentCollector({
            filter: i => i.user.id === interaction.user.id,
            time: 300000, // 5 minutes
        });

        collector.on('collect', async i => {
            try {
                if (i.isStringSelectMenu()) {
                    currentCategory = i.values[0];
                    currentPage = 0; // Reset to first page when changing category
                } else if (i.isButton()) {
                    switch (i.customId) {
                        case 'help_next':
                            currentPage++;
                            break;
                        case 'help_prev':
                            currentPage--;
                            break;
                        case 'help_refresh':
                            // Keep current page and category
                            break;
                        case 'help_close':
                            await i.update({
                                content: '👋 Help menu closed. Use `/help` to open it again!',
                                embeds: [],
                                components: []
                            });
                            return;
                    }
                }

                const newEmbed = generateEmbed(currentPage, currentCategory);
                const newComponents = generateComponents(currentPage, currentCategory);

                await i.update({
                    embeds: [newEmbed],
                    components: newComponents
                });
            } catch (error) {
                console.error('Error updating help menu:', error);
            }
        });

        collector.on('end', async () => {
            try {
                const finalComponents = generateComponents(currentPage, currentCategory);
                finalComponents.forEach(row => {
                    row.components.forEach(component => {
                        if (component.setDisabled) component.setDisabled(true);
                    });
                });
                
                await interaction.editReply({ 
                    components: finalComponents 
                }).catch(() => {}); // Ignore errors if message was deleted
            } catch (error) {
                console.error('Error disabling help menu:', error);
            }
        });
    },

    getUsageString(command) {
        if (!command.options || command.options.length === 0) {
            return '';
        }
        
        return ' ' + command.options.map(option => {
            return option.required ? `<${option.name}>` : `[${option.name}]`;
        }).join(' ');
    },

    getCommandCategory(commandName) {
        for (const [category, commands] of Object.entries(COMMAND_CATEGORIES)) {
            if (commands.includes(commandName)) {
                return category.split(' ')[0]; // Return just the emoji
            }
        }
        return '⚙️'; // Default category
    },

    getCommandExamples(commandName) {
        const examples = {
            'playerinfo': [
                '`/playerinfo` - Get your own player info',
                '`/playerinfo user:@username` - Get another user\'s info'
            ],
            'metrics': [
                '`/metrics` - Basic bot metrics',
                '`/metrics type:performance` - Performance dashboard',
                '`/metrics type:cache` - Cache statistics'
            ],
            'help': [
                '`/help` - Show main help menu',
                '`/help command:playerinfo` - Detailed command help',
                '`/help category:game` - Game commands only'
            ]
        };
        
        return examples[commandName] || [];
    }
};
