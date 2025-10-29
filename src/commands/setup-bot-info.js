const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const BotInfoMessage = require('../database/models/BotInfoMessage');
const { generateBotInfoEmbed } = require('../utils/bot-info.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-bot-info')
        .setDescription('🔧 Sets up a persistent bot information embed with interactive features')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to post the bot info message in')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of bot info message to create')
                .setRequired(false)
                .addChoices(
                    { name: '📊 Basic Info', value: 'basic' },
                    { name: '🎯 Interactive Info', value: 'interactive' },
                    { name: '📋 Quick Stats', value: 'stats' }
                )
        ),

    async execute(interaction) {
        try {
            const channel = interaction.options.getChannel('channel');
            const infoType = interaction.options.getString('type') || 'basic';

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
                let infoMessage;
                let infoEmbed;

                switch (infoType) {
                    case 'interactive':
                        infoEmbed = await this.createInteractiveBotInfoEmbed(interaction.client);
                        infoMessage = await channel.send({ 
                            embeds: [infoEmbed],
                            components: [this.createBotInfoButtons()]
                        });
                        break;
                    case 'stats':
                        infoEmbed = await this.createQuickStatsEmbed(interaction.client);
                        infoMessage = await channel.send({ embeds: [infoEmbed] });
                        break;
                    default:
                        infoEmbed = await generateBotInfoEmbed(interaction.client);
                        infoMessage = await channel.send({ embeds: [infoEmbed] });
                }

                // Save to database
            await BotInfoMessage.findOneAndUpdate(
                { guildId: interaction.guild.id },
                {
                    guildId: interaction.guild.id,
                    channelId: channel.id,
                    messageId: infoMessage.id,
                        infoType,
                        createdAt: new Date(),
                        updatedAt: new Date()
                },
                { upsert: true, new: true }
            );

                // Create success embed
                const successEmbed = new EmbedBuilder()
                    .setColor(0x00ff00)
                    .setTitle('✅ Bot Info Message Setup Complete')
                    .setDescription(`Successfully created ${infoType} bot info message in ${channel}`)
                    .addFields(
                        {
                            name: '📋 Details',
                            value: `**Channel:** ${channel}\n**Type:** ${infoType}\n**Message ID:** ${infoMessage.id}`,
                            inline: false
                        },
                        {
                            name: '🔧 Management',
                            value: '• Use `/setup-bot-info` again to update\n• Delete the message to remove\n• Bot will auto-update on restart',
                            inline: false
                        }
                    )
                    .setTimestamp()
                    .setFooter({ text: 'BBG Bot Setup' });

                await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            console.error('Error setting up bot info message:', error);
                
                const errorEmbed = new EmbedBuilder()
                    .setColor(0xff0000)
                    .setTitle('❌ Setup Failed')
                    .setDescription('An error occurred while setting up the bot info message.')
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
        } catch (error) {
            console.error('Error in setup-bot-info command:', error);
            try {
                await interaction.editReply({
                    content: '❌ An unexpected error occurred while setting up the bot info message.'
                });
            } catch (replyError) {
                console.error('Failed to send error response:', replyError.message);
            }
        }
    },

    async createInteractiveBotInfoEmbed(client) {
        const embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle('🤖 BBG Bot Information Center')
            .setDescription('Welcome to the BBG Bot! Use the buttons below to explore different bot features and information.')
            .addFields(
                {
                    name: '🎮 Game Features',
                    value: 'Player verification, code redemption, schedule tracking',
                    inline: true
                },
                {
                    name: '⚙️ Utility Features',
                    value: 'Help system, ping monitoring, uptime tracking',
                    inline: true
                },
                {
                    name: '📊 Admin Features',
                    value: 'Performance metrics, announcements, polls',
                    inline: true
                },
                {
                    name: '🔧 Moderation',
                    value: 'Member management, timeout controls, ban systems',
                    inline: true
                },
                {
                    name: '🎯 Fun Features',
                    value: 'Memes, jokes, quotes, entertainment',
                    inline: true
                },
                {
                    name: '📝 Information',
                    value: 'Server info, user details, role management',
                    inline: true
                }
            )
            .setFooter({ 
                text: `BBG Bot • ${client.guilds.cache.size} servers • ${client.users.cache.size} users` 
            })
            .setTimestamp();

        return embed;
    },

    async createQuickStatsEmbed(client) {
        const embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle('📊 BBG Bot Quick Stats')
            .setDescription('Essential bot statistics and information')
            .addFields(
                {
                    name: '🌐 Server Stats',
                    value: `**Servers:** ${client.guilds.cache.size}\n**Users:** ${client.users.cache.size}\n**Channels:** ${client.channels.cache.size}`,
                    inline: true
                },
                {
                    name: '⚡ Performance',
                    value: `**Uptime:** ${this.formatUptime(client.uptime)}\n**Memory:** ${this.getMemoryUsage()}\n**Ping:** ${client.ws.ping}ms`,
                    inline: true
                },
                {
                    name: '🎮 Game Integration',
                    value: `**Verified Users:** ${await this.getVerifiedUserCount()}\n**Active Features:** 6\n**API Status:** ✅ Online`,
                    inline: true
                }
            )
            .setFooter({ text: 'BBG Bot Quick Stats' })
            .setTimestamp();

        return embed;
    },

    createBotInfoButtons() {
        return new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('botinfo_features')
                    .setLabel('🎮 Features')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId('botinfo_stats')
                    .setLabel('📊 Stats')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('botinfo_commands')
                    .setLabel('⚙️ Commands')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('botinfo_help')
                    .setLabel('📚 Help')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('botinfo_refresh')
                    .setLabel('🔄 Refresh')
                    .setStyle(ButtonStyle.Primary)
            );
    },

    formatUptime(uptime) {
        const days = Math.floor(uptime / 86400000);
        const hours = Math.floor((uptime % 86400000) / 3600000);
        const minutes = Math.floor((uptime % 3600000) / 60000);
        return `${days}d ${hours}h ${minutes}m`;
    },

    getMemoryUsage() {
        const used = process.memoryUsage();
        return `${Math.round(used.heapUsed / 1024 / 1024)}MB`;
    },

    async getVerifiedUserCount() {
        try {
            const User = require('../database/models.User');
            const count = await User.countDocuments({ verified: true });
            return count;
        } catch (error) {
            return 'N/A';
        }
    }
};