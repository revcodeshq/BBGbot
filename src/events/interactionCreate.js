const VerificationHandler = require('../handlers/verification-handler');
const PollHandler = require('../handlers/poll-handler');
const ReminderHandler = require('../handlers/reminder-handler');
const { ErrorHandler } = require('../utils/error-handler');
const { metrics } = require('../utils/metrics');
const InteractionHandler = require('../utils/interaction-handler');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    try {
      // Check if interaction is still valid before processing
      if (InteractionHandler.isInteractionExpired(interaction)) {
        console.warn(`[InteractionCreate] Interaction expired: ${interaction.type}`);
        return;
      }

      // Track interaction
      metrics.trackInteraction();
      
      // Track user and guild data from Discord client
      if (interaction.user) {
        metrics.trackUser(interaction.user.id, interaction.guild?.id);
      }
      
      // Track message if it's a message interaction
      if (interaction.isMessageComponent()) {
        metrics.trackMessage();
      }

      if (interaction.isButton()) {
        await this.handleButtonInteraction(interaction);
      } else if (interaction.isModalSubmit()) {
        await this.handleModalInteraction(interaction);
      } else if (interaction.isChatInputCommand()) {
        await this.handleCommandInteraction(interaction, client);
      }
    } catch (error) {
      const errorResponse = ErrorHandler.handleError(error, {
        interaction,
        user: interaction.user,
        guild: interaction.guild,
        channel: interaction.channel,
        interactionType: interaction.type
      });

      // Only try to reply if the interaction is still valid
      try {
        if (InteractionHandler.isInteractionValid(interaction)) {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: errorResponse.userMessage,
              flags: 64 // Ephemeral
            });
          }
        }
      } catch (replyError) {
        // If we can't reply, just log the error to prevent unhandled rejections
        console.error('Failed to send error response to interaction:', replyError.message);
      }
    }
  },

  async handleButtonInteraction(interaction) {
    const { customId } = interaction;

    if (customId === 'start_verification') {
      await VerificationHandler.handleStartVerification(interaction);
    } else if (customId.startsWith('approve_')) {
      const userId = customId.split('_')[1];
      await VerificationHandler.handleApproval(interaction, userId);
    } else if (customId.startsWith('reject_')) {
      const userId = customId.split('_')[1];
      await VerificationHandler.handleRejection(interaction, userId);
    } else if (customId.startsWith('create_reminder_')) {
      await ReminderHandler.handleCreateReminder(interaction);
    } else if (customId.startsWith('poll_')) {
      await PollHandler.handlePollVote(interaction);
    } else if (customId.startsWith('help_')) {
      await this.handleHelpButton(interaction);
    } else if (customId.startsWith('botinfo_')) {
      await this.handleBotInfoButton(interaction);
    }
  },

  async handleModalInteraction(interaction) {
    const { customId } = interaction;

    if (customId === 'verify_modal') {
      await VerificationHandler.handleVerificationModal(interaction);
    } else if (customId === 'reminder_modal') {
      await ReminderHandler.handleReminderModal(interaction);
    }
  },

  async handleHelpButton(interaction) {
    const { customId } = interaction;
    const { EmbedBuilder } = require('discord.js');

    try {
      await interaction.deferReply({ flags: 64 });

      let embed;
      let title;
      let description;

      switch (customId) {
        case 'help_game':
          title = '🎮 Game Commands';
          description = 'Commands related to game functionality';
          embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle(title)
            .setDescription(description)
            .addFields(
              { name: 'Player Info', value: '`/playerinfo` - Get player statistics', inline: true },
              { name: 'Code Redemption', value: '`/redeem` - Redeem game codes', inline: true },
              { name: 'Schedule', value: '`/schedule` - View game schedules', inline: true }
            );
          break;

        case 'help_utility':
          title = '⚙️ Utility Commands';
          description = 'General utility and helper commands';
          embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle(title)
            .setDescription(description)
            .addFields(
              { name: 'Help System', value: '`/help` - Interactive help system', inline: true },
              { name: 'Ping', value: '`/ping` - Check bot latency', inline: true },
              { name: 'Uptime', value: '`/uptime` - Bot uptime info', inline: true }
            );
          break;

        case 'help_admin':
          title = '📊 Admin Commands';
          description = 'Administrative and management commands';
          embed = new EmbedBuilder()
            .setColor(0xff6b35)
            .setTitle(title)
            .setDescription(description)
            .addFields(
              { name: 'Metrics', value: '`/metrics` - Bot performance stats', inline: true },
              { name: 'Announce', value: '`/announce` - Send announcements', inline: true },
              { name: 'Polls', value: '`/poll` - Create and manage polls', inline: true }
            );
          break;

        case 'help_fun':
          title = '🎯 Fun Commands';
          description = 'Entertainment and fun commands';
          embed = new EmbedBuilder()
            .setColor(0xff69b4)
            .setTitle(title)
            .setDescription(description)
            .addFields(
              { name: 'Memes', value: '`/meme` - Random memes', inline: true },
              { name: 'Jokes', value: '`/joke` - Get jokes', inline: true },
              { name: 'Quotes', value: '`/quote` - Manage quotes', inline: true }
            );
          break;

        case 'help_full':
          title = '📚 Full Help System';
          description = 'Access the complete interactive help system';
          embed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle(title)
            .setDescription(description)
            .addFields(
              { name: 'Interactive Help', value: 'Use `/help` for the full interactive help system', inline: false },
              { name: 'Command Details', value: 'Use `/help command:<name>` for detailed command info', inline: false },
              { name: 'Category View', value: 'Use `/help category:<name>` for category-specific commands', inline: false }
            );
          break;

        default:
          embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Unknown Help Category')
            .setDescription('This help category is not recognized.');
      }

      embed.setTimestamp()
           .setFooter({ text: 'BBG Bot Help System' });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error handling help button:', error);
      try {
        await interaction.editReply({
          content: '❌ An error occurred while processing the help request.'
        });
      } catch (replyError) {
        console.error('Failed to send error response:', replyError.message);
      }
    }
  },

  async handleBotInfoButton(interaction) {
    const { customId } = interaction;
    const { EmbedBuilder } = require('discord.js');

    try {
      await interaction.deferReply({ flags: 64 });

      let embed;
      let title;
      let description;

      switch (customId) {
        case 'botinfo_features':
          title = '🎮 Bot Features';
          description = 'Comprehensive overview of BBG Bot capabilities';
          embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle(title)
            .setDescription(description)
            .addFields(
              { name: '🎮 Game Integration', value: 'Player verification, code redemption, schedule tracking', inline: false },
              { name: '⚙️ Utility Tools', value: 'Help system, ping monitoring, uptime tracking', inline: false },
              { name: '📊 Admin Features', value: 'Performance metrics, announcements, polls', inline: false },
              { name: '🔧 Moderation', value: 'Member management, timeout controls, ban systems', inline: false },
              { name: '🎯 Entertainment', value: 'Memes, jokes, quotes, fun commands', inline: false },
              { name: '📝 Information', value: 'Server info, user details, role management', inline: false }
            );
          break;

        case 'botinfo_stats':
          title = '📊 Bot Statistics';
          description = 'Real-time bot performance and usage statistics';
          embed = new EmbedBuilder()
            .setColor(0x0099ff)
            .setTitle(title)
            .setDescription(description)
            .addFields(
              { name: '🌐 Server Stats', value: `**Servers:** ${interaction.client.guilds.cache.size}\n**Users:** ${interaction.client.users.cache.size}\n**Channels:** ${interaction.client.channels.cache.size}`, inline: true },
              { name: '⚡ Performance', value: `**Uptime:** ${this.formatUptime(interaction.client.uptime)}\n**Memory:** ${this.getMemoryUsage()}\n**Ping:** ${interaction.client.ws.ping}ms`, inline: true },
              { name: '🎮 Game Integration', value: `**Verified Users:** ${await this.getVerifiedUserCount()}\n**Active Features:** 6\n**API Status:** ✅ Online`, inline: true }
            );
          break;

        case 'botinfo_commands':
          title = '⚙️ Command Categories';
          description = 'Overview of available command categories';
          embed = new EmbedBuilder()
            .setColor(0xff6b35)
            .setTitle(title)
            .setDescription(description)
            .addFields(
              { name: '🎮 Game Commands', value: '`/playerinfo` `/redeem` `/schedule`', inline: true },
              { name: '⚙️ Utility Commands', value: '`/help` `/ping` `/uptime`', inline: true },
              { name: '📊 Admin Commands', value: '`/metrics` `/announce` `/poll`', inline: true },
              { name: '🔧 Moderation', value: '`/kick` `/ban` `/timeout`', inline: true },
              { name: '🎯 Fun Commands', value: '`/meme` `/joke` `/quote`', inline: true },
              { name: '📝 Information', value: '`/serverinfo` `/userinfo` `/roleinfo`', inline: true }
            );
          break;

        case 'botinfo_help':
          title = '📚 Help & Support';
          description = 'Get help and support for BBG Bot';
          embed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle(title)
            .setDescription(description)
            .addFields(
              { name: '🔍 Getting Help', value: 'Use `/help` for the interactive help system', inline: false },
              { name: '📖 Command Details', value: 'Use `/help command:<name>` for detailed command info', inline: false },
              { name: '📂 Category View', value: 'Use `/help category:<name>` for category-specific commands', inline: false },
              { name: '🆘 Support', value: 'Contact server administrators for additional help', inline: false }
            );
          break;

        case 'botinfo_refresh':
          title = '🔄 Bot Info Refreshed';
          description = 'Bot information has been updated with latest data';
          embed = new EmbedBuilder()
            .setColor(0x00ff00)
            .setTitle(title)
            .setDescription(description)
            .addFields(
              { name: '🌐 Current Stats', value: `**Servers:** ${interaction.client.guilds.cache.size}\n**Users:** ${interaction.client.users.cache.size}\n**Uptime:** ${this.formatUptime(interaction.client.uptime)}`, inline: true },
              { name: '⚡ Performance', value: `**Memory:** ${this.getMemoryUsage()}\n**Ping:** ${interaction.client.ws.ping}ms\n**Status:** ✅ Online`, inline: true }
            );
          break;

        default:
          embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle('❌ Unknown Bot Info Category')
            .setDescription('This bot info category is not recognized.');
      }

      embed.setTimestamp()
           .setFooter({ text: 'BBG Bot Information System' });

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('Error handling bot info button:', error);
      try {
        await interaction.editReply({
          content: '❌ An error occurred while processing the bot info request.'
        });
      } catch (replyError) {
        console.error('Failed to send error response:', replyError.message);
      }
    }
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
  },

  async handleCommandInteraction(interaction, client) {
    // Debug: print all loaded command names
    console.log('[DEBUG] Loaded commands:', Array.from(client.commands.keys()));
    console.log('[DEBUG] Received interaction for command:', interaction.commandName);
    const command = client.commands.get(interaction.commandName);
    // Fix: define ephemeral safely
    let ephemeral = false;
    if (command?.data?.options) {
      const opt = command.data.options.find?.(opt => opt.name === 'ephemeral');
      if (opt && typeof opt.default !== 'undefined') ephemeral = opt.default;
    }
    if (command) {
      try {
        // Debug logging for command dispatch
        console.log('[DEBUG] handleCommandInteraction:', interaction.commandName, 'ephemeral:', ephemeral);
        await InteractionHandler.executeCommand(interaction, command.execute.bind(command), { ephemeral });
      } catch (error) {
        // Error handling is already done in InteractionHandler.executeCommand
        console.error(`Command execution failed for ${interaction.commandName}:`, error.message);
      }
    } else {
      console.error('[DEBUG] Command not found in client.commands:', interaction.commandName);
    }
  }
};