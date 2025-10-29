const { SlashCommandBuilder, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const HelpMessage = require('../database/models.HelpMessage');
const { getStaticHelpEmbed } = require('../utils/help');
const InteractionHandler = require('../utils/interaction-handler');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setuphelp')
        .setDescription('🔧 Sets up a persistent help message in a channel with interactive features')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to post the help message in')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of help message to create')
                .setRequired(false)
                .addChoices(
                    { name: '📚 Static Help', value: 'static' },
                    { name: '🎯 Interactive Help', value: 'interactive' },
                    { name: '📋 Quick Reference', value: 'quick' }
                ))
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),

    async execute(interaction) {
        await InteractionHandler.executeCommand(interaction, async (interaction) => {
            const channel = interaction.options.getChannel('channel');
            const helpType = interaction.options.getString('type') || 'static';

            // Validate channel
            if (!channel.isTextBased()) {
                await interaction.editReply({ 
                    content: '❌ Please select a text channel. Voice channels and threads are not supported.' 
                });
                return;
            }

            // Check bot permissions
            const botMember = interaction.guild.members.me;
            if (!botMember.permissionsIn(channel).has(['SendMessages', 'EmbedLinks'])) {
                await interaction.editReply({ 
                    content: `❌ I don't have permission to send messages or embeds in ${channel}. Please check my permissions.` 
                });
                return;
            }

            try {
                let helpMessage;
                let helpEmbed;

                switch (helpType) {
                    case 'interactive':
                        helpEmbed = await this.createInteractiveHelpEmbed(interaction.client);
                        helpMessage = await channel.send({ 
                            embeds: [helpEmbed],
                            components: [this.createHelpButtons()]
                        });
                        break;
                    case 'quick':
                        helpEmbed = await this.createQuickReferenceEmbed(interaction.client);
                        helpMessage = await channel.send({ embeds: [helpEmbed] });
                        break;
                    default:
                        helpEmbed = getStaticHelpEmbed();
                        helpMessage = await channel.send({ embeds: [helpEmbed] });
                }

                // Save to database
                await HelpMessage.findOneAndUpdate(
                    { guildId: interaction.guild.id },
                    {
                        guildId: interaction.guild.id,
                        channelId: channel.id,
                        messageId: helpMessage.id,
                        helpType,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    },
                    { upsert: true, new: true }
                );

                // Create success embed
                const successEmbed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle('✅ Help Message Setup Complete')
                    .setDescription(`Successfully created ${helpType} help message in ${channel}`)
                    .addFields(
                        {
                            name: '📋 Details',
                            value: `**Channel:** ${channel}\n**Type:** ${helpType}\n**Message ID:** ${helpMessage.id}`,
                            inline: false
                        },
                        {
                            name: '🔧 Management',
                            value: '• Use `/setuphelp` again to update\n• Delete the message to remove\n• Bot will auto-update on restart',
                            inline: false
                        }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'BBG Bot Setup' });

                await interaction.editReply({ embeds: [successEmbed] });

            } catch (error) {
                console.error('Error setting up help message:', error);
                
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('❌ Setup Failed')
                    .setDescription('An error occurred while setting up the help message.')
                    .addFields(
                        {
                            name: '🔍 Possible Causes',
                            value: '• Insufficient permissions\n• Channel restrictions\n• Message limit reached\n• Network issues',
                            inline: false
                        },
                        {
                            name: '💡 Solutions',
                            value: '• Check bot permissions\n• Try a different channel\n• Contact server admin',
                            inline: false
                        }
                    )
                    .setTimestamp();

                await interaction.editReply({ embeds: [errorEmbed] });
            }
        });
    },

    async createInteractiveHelpEmbed(client) {
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('📚 BBG Bot Help Center')
            .setDescription('Welcome to the BBG Bot! Use the buttons below to explore different command categories.')
            .addFields(
                {
                    name: '🎮 Game Commands',
                    value: '`/playerinfo` `/redeem` `/schedule`',
                    inline: true
                },
                {
                    name: '⚙️ Utility Commands',
                    value: '`/help` `/ping` `/uptime`',
                    inline: true
                },
                {
                    name: '📊 Admin Commands',
                    value: '`/metrics` `/announce` `/poll`',
                    inline: true
                },
                {
                    name: '🔧 Moderation',
                    value: '`/kick` `/ban` `/timeout`',
                    inline: true
                },
                {
                    name: '🎯 Fun Commands',
                    value: '`/meme` `/joke` `/quote`',
                    inline: true
                },
                {
                    name: '📝 Information',
                    value: '`/serverinfo` `/userinfo` `/roleinfo`',
                    inline: true
                }
            )
            .setFooter({ 
                text: `BBG Bot • ${client.guilds.cache.size} servers • Use /help for detailed info` 
            })
            .setTimestamp();

        return embed;
    },

    async createQuickReferenceEmbed(_client) {
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('📋 Quick Command Reference')
            .setDescription('Essential commands for BBG Bot')
            .addFields(
                {
                    name: '🎮 Game',
                    value: '`/playerinfo` `/redeem` `/schedule`',
                    inline: true
                },
                {
                    name: '⚙️ Utility',
                    value: '`/help` `/ping` `/uptime`',
                    inline: true
                },
                {
                    name: '📊 Admin',
                    value: '`/metrics` `/announce` `/poll`',
                    inline: true
                },
                {
                    name: '🔧 Moderation',
                    value: '`/kick` `/ban` `/timeout`',
                    inline: true
                },
                {
                    name: '🎯 Fun',
                    value: '`/meme` `/joke` `/quote`',
                    inline: true
                },
                {
                    name: '📝 Info',
                    value: '`/serverinfo` `/userinfo` `/roleinfo`',
                    inline: true
                }
            )
            .setFooter({ text: 'BBG Bot Quick Reference' })
            .setTimestamp();

        return embed;
    },

    createHelpButtons() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('help_game')
                    .setLabel('🎮 Game')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('help_utility')
                    .setLabel('⚙️ Utility')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('help_admin')
                    .setLabel('📊 Admin')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('help_fun')
                    .setLabel('🎯 Fun')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('help_full')
                    .setLabel('📚 Full Help')
                    .setStyle(ButtonStyle.Primary)
            );
    }
};