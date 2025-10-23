const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const HealthCheckSystem = require('../utils/health-check');
const ProductionValidator = require('../utils/production-validator');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('health')
        .setDescription('🏥 Check bot health status and system diagnostics')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type of health check to perform')
                .setRequired(false)
                .addChoices(
                    { name: '📊 Quick Status', value: 'quick' },
                    { name: '🔍 Detailed Diagnostics', value: 'detailed' },
                    { name: '⚙️ Environment Validation', value: 'environment' },
                    { name: '📈 Performance Metrics', value: 'performance' },
                    { name: '🔧 System Information', value: 'system' }
                )
        ),

    async execute(interaction) {
        try {
            const checkType = interaction.options.getString('type') || 'quick';
            let embed;

            switch (checkType) {
                case 'detailed':
                    embed = await this.createDetailedHealthEmbed(interaction.client);
                    break;
                case 'environment':
                    embed = await this.createEnvironmentValidationEmbed();
                    break;
                case 'performance':
                    embed = await this.createPerformanceMetricsEmbed(interaction.client);
                    break;
                case 'system':
                    embed = await this.createSystemInfoEmbed();
                    break;
                default:
                    embed = await this.createQuickStatusEmbed(interaction.client);
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in health command:', error);
            try {
                await interaction.editReply({
                    content: '❌ An error occurred while checking bot health.'
                });
            } catch (replyError) {
                console.error('Failed to send error response:', replyError.message);
            }
        }
    },

    async createQuickStatusEmbed(client) {
        const { EmbedBuilder } = require('discord.js');
        
        // Get basic health info
        const uptime = process.uptime();
        const memoryUsage = process.memoryUsage();
        const ping = client.ws.ping;
        
        const embed = new EmbedBuilder()
            .setTitle('🏥 Bot Health Status')
            .setColor(0x00ff00)
            .setTimestamp()
            .addFields(
                {
                    name: '🤖 Bot Status',
                    value: `**Status:** ${client.isReady ? '✅ Online' : '❌ Offline'}\n**Ping:** ${ping}ms\n**Uptime:** ${this.formatUptime(uptime)}`,
                    inline: true
                },
                {
                    name: '💾 Memory Usage',
                    value: `**Used:** ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB\n**Total:** ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
                    inline: true
                },
                {
                    name: '🌐 Server Info',
                    value: `**Guilds:** ${client.guilds.cache.size}\n**Users:** ${client.users.cache.size}\n**Channels:** ${client.channels.cache.size}`,
                    inline: true
                }
            );

        return embed;
    },

    async createDetailedHealthEmbed(client) {
        const { EmbedBuilder } = require('discord.js');
        
        // Initialize health check system if not already done
        if (!client.healthCheck) {
            client.healthCheck = new HealthCheckSystem(client);
        }
        
        const healthStatus = client.healthCheck.getHealthStatus();
        const embed = client.healthCheck.createHealthEmbed();
        
        // Add additional detailed information
        embed.addFields(
            {
                name: '📊 Command Statistics',
                value: `**Loaded Commands:** ${client.commands?.size || 0}\n**Loaded Events:** ${client.events?.size || 0}`,
                inline: true
            },
            {
                name: '🔗 Database Status',
                value: `**Connection:** ${require('mongoose').connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}\n**Host:** ${require('mongoose').connection.host || 'N/A'}`,
                inline: true
            },
            {
                name: '⚡ Performance',
                value: `**Node Version:** ${process.version}\n**Platform:** ${process.platform}`,
                inline: true
            }
        );

        return embed;
    },

    async createEnvironmentValidationEmbed() {
        const { EmbedBuilder } = require('discord.js');
        
        const validator = new ProductionValidator();
        const validation = validator.validateProductionEnvironment();
        
        const embed = new EmbedBuilder()
            .setTitle('⚙️ Environment Validation')
            .setColor(validation.isValid ? 0x00ff00 : 0xff0000)
            .setTimestamp();

        // Add validation results
        if (validation.isValid) {
            embed.setDescription('✅ Environment validation passed!');
        } else {
            embed.setDescription('❌ Environment validation failed!');
        }

        if (validation.errors.length > 0) {
            embed.addFields({
                name: '🚨 Critical Errors',
                value: validation.errors.map(error => `• ${error}`).join('\n'),
                inline: false
            });
        }

        if (validation.warnings.length > 0) {
            embed.addFields({
                name: '⚠️ Warnings',
                value: validation.warnings.map(warning => `• ${warning}`).join('\n'),
                inline: false
            });
        }

        if (validation.recommendations.length > 0) {
            embed.addFields({
                name: '💡 Recommendations',
                value: validation.recommendations.map(rec => `• ${rec}`).join('\n'),
                inline: false
            });
        }

        return embed;
    },

    async createPerformanceMetricsEmbed(client) {
        const { EmbedBuilder } = require('discord.js');
        
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        const uptime = process.uptime();
        
        const embed = new EmbedBuilder()
            .setTitle('📈 Performance Metrics')
            .setColor(0x0099ff)
            .setTimestamp()
            .addFields(
                {
                    name: '🧠 Memory Usage',
                    value: `**Heap Used:** ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB\n**Heap Total:** ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB\n**External:** ${Math.round(memoryUsage.external / 1024 / 1024)}MB`,
                    inline: true
                },
                {
                    name: '⚡ CPU Usage',
                    value: `**User:** ${Math.round(cpuUsage.user / 1000)}ms\n**System:** ${Math.round(cpuUsage.system / 1000)}ms`,
                    inline: true
                },
                {
                    name: '🕒 Uptime',
                    value: `**Total:** ${this.formatUptime(uptime)}\n**Start Time:** ${new Date(Date.now() - uptime * 1000).toLocaleString()}`,
                    inline: true
                },
                {
                    name: '🌐 Network',
                    value: `**Discord Ping:** ${client.ws.ping}ms\n**WebSocket Status:** ${client.ws.status}`,
                    inline: true
                },
                {
                    name: '📊 Load Average',
                    value: `**1m:** ${require('os').loadavg()[0].toFixed(2)}\n**5m:** ${require('os').loadavg()[1].toFixed(2)}\n**15m:** ${require('os').loadavg()[2].toFixed(2)}`,
                    inline: true
                },
                {
                    name: '💽 Disk Usage',
                    value: `**Free Space:** ${Math.round(require('fs').statSync('.').size / 1024 / 1024)}MB`,
                    inline: true
                }
            );

        return embed;
    },

    async createSystemInfoEmbed() {
        const { EmbedBuilder } = require('discord.js');
        const os = require('os');
        
        const embed = new EmbedBuilder()
            .setTitle('🔧 System Information')
            .setColor(0x9b59b6)
            .setTimestamp()
            .addFields(
                {
                    name: '💻 System',
                    value: `**OS:** ${os.type()} ${os.release()}\n**Architecture:** ${os.arch()}\n**Hostname:** ${os.hostname()}`,
                    inline: true
                },
                {
                    name: '🖥️ Hardware',
                    value: `**CPU Cores:** ${os.cpus().length}\n**Total Memory:** ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB\n**Free Memory:** ${Math.round(os.freemem() / 1024 / 1024 / 1024)}GB`,
                    inline: true
                },
                {
                    name: '📦 Runtime',
                    value: `**Node.js:** ${process.version}\n**V8:** ${process.versions.v8}\n**Platform:** ${process.platform}`,
                    inline: true
                },
                {
                    name: '📁 Process',
                    value: `**PID:** ${process.pid}\n**Working Directory:** ${process.cwd()}\n**Environment:** ${process.env.NODE_ENV || 'development'}`,
                    inline: true
                }
            );

        return embed;
    },

    formatUptime(uptime) {
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        
        if (days > 0) {
            return `${days}d ${hours}h ${minutes}m ${seconds}s`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }
};
