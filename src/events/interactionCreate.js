const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const Announcement = require('../database/models.Announcements');
const Poll = require('../database/models.Poll');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { brandingText } = require('../utils/branding.js');
const { getFurnaceLevelName } = require('../utils/game-utils.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, client) {
    if (interaction.isButton()) {
      if (interaction.customId === 'start_verification') {
        const modal = new ModalBuilder()
          .setCustomId('verify_modal')
          .setTitle('Alliance Verification');

        const fidInput = new TextInputBuilder()
          .setCustomId('fid_input')
          .setLabel('Paste your Whiteout Survival FID')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 123456789')
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(fidInput));
        await interaction.showModal(modal);
      }
      else if (interaction.customId.startsWith('approve_')) {
        const userId = interaction.customId.split('_')[1];
        const User = require('../database/models.User');
        const member = await interaction.guild.members.fetch(userId);
        await User.findOneAndUpdate({ discordId: userId }, { verified: true });
        const memberRole = interaction.guild.roles.cache.get('1421959390570873003');
        if (memberRole) await member.roles.add(memberRole);
        const roleToRemove = interaction.guild.roles.cache.get('1421959206751440996');
        if (roleToRemove) await member.roles.remove(roleToRemove);
        const botActivityChannel = interaction.guild.channels.cache.find(ch => ch.name.includes('📝-bot-activity') && ch.isTextBased());
        if (botActivityChannel) {
          await botActivityChannel.send({
            content: `✅ <@${userId}> approved by <@${interaction.user.id}> and assigned Member role.`
          });
        }
        const row = new (require('discord.js').ActionRowBuilder)().addComponents(
          new (require('discord.js').ButtonBuilder)().setCustomId('approve_disabled').setLabel('Approve').setStyle(ButtonStyle.Success).setDisabled(true),
          new (require('discord.js').ButtonBuilder)().setCustomId('reject_disabled').setLabel('Reject').setStyle(ButtonStyle.Danger).setDisabled(true)
        );
        await interaction.message.edit({ components: [row] });
        await interaction.reply({ content: `✅ Approved by <@${interaction.user.id}>`, flags: 0 });
        try {
          await member.send('✅ You have been verified and promoted to Member!');
        } catch {}
      }
      else if (interaction.customId.startsWith('reject_')) {
        const userId = interaction.customId.split('_')[1];
        const User = require('../database/models.User');
        await User.findOneAndDelete({ discordId: userId });
        const botActivityChannel = interaction.guild.channels.cache.find(ch => ch.name.includes('bot-activity') && ch.isTextBased());
        if (botActivityChannel) {
          await botActivityChannel.send({
            content: `❌ <@${userId}> rejected by <@${interaction.user.id}>.`
          });
        }
        const row = new (require('discord.js').ActionRowBuilder)().addComponents(
          new (require('discord.js').ButtonBuilder)().setCustomId('approve_disabled').setLabel('Approve').setStyle(ButtonStyle.Success).setDisabled(true),
          new (require('discord.js').ButtonBuilder)().setCustomId('reject_disabled').setLabel('Reject').setStyle(ButtonStyle.Danger).setDisabled(true)
        );
        await interaction.message.edit({ components: [row] });
        await interaction.reply({ content: `❌ Rejected by <@${interaction.user.id}>`, flags: 0 });
        try {
          const member = await interaction.guild.members.fetch(userId);
          await member.send('❌ Your verification was rejected by the leaders.');
        } catch {}
      }
      // --- SMART REMINDER BUTTON ---
      else if (interaction.customId.startsWith('create_reminder_')) {
            const parts = interaction.customId.split('_');
            const description = parts.slice(2, parts.length - 1).join('_');
            const time = parts[parts.length - 1];

            const modal = new ModalBuilder()
                .setCustomId('reminder_modal')
                .setTitle('Create a New Reminder');

            const descriptionInput = new TextInputBuilder()
                .setCustomId('reminder_description')
                .setLabel("What is the event?")
                .setStyle(TextInputStyle.Short)
                .setValue(description)
                .setRequired(true);

            const timeInput = new TextInputBuilder()
                .setCustomId('reminder_time')
                .setLabel("When is the event?")
                .setStyle(TextInputStyle.Short)
                .setValue(time)
                .setRequired(true);
            
            const channelInput = new TextInputBuilder()
                .setCustomId('reminder_channel')
                .setLabel("Channel to announce in (e.g., #general)")
                .setStyle(TextInputStyle.Short)
                .setValue(interaction.channel.name)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(descriptionInput),
                new ActionRowBuilder().addComponents(timeInput),
                new ActionRowBuilder().addComponents(channelInput)
            );

            await interaction.showModal(modal);
      }
      else if (interaction.customId.startsWith('poll_')) {
        await interaction.deferUpdate();
        const [_, pollInteractionId, optionIndexStr] = interaction.customId.split('_');
        const optionIndex = parseInt(optionIndexStr);

        const poll = await Poll.findOne({ messageId: interaction.message.id });

        if (!poll) {
            return;
        }

        const voter = poll.voters.find(v => v.userId === interaction.user.id);
        if (voter) {
            await interaction.followUp({ content: 'You have already voted in this poll.', ephemeral: true });
            return;
        }

        poll.voters.push({ userId: interaction.user.id, optionIndex });
        await poll.save();

        const totalVotes = poll.voters.length;
        const optionFields = poll.options.map((option, index) => {
            const voteCount = poll.voters.filter(v => v.optionIndex === index).length;
            const percentage = totalVotes > 0 ? ((voteCount / totalVotes) * 100).toFixed(2) : 0;
            return { name: `${index + 1}. ${option}`, value: `${voteCount} votes (${percentage}%)`, inline: false };
        });

        const pollEmbed = new EmbedBuilder(interaction.message.embeds[0])
            .setFields(optionFields);

        await interaction.message.edit({ embeds: [pollEmbed] });
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'verify_modal') {
        const fid = interaction.fields.getTextInputValue('fid_input');
        if (fid.length < 6 || fid.length > 15) {
            await interaction.reply({ content: '❌ FID must be between 6 and 15 characters.', flags: 64 });
            return;
        }
        const User = require('../database/models.User');
        const existing = await User.findOne({ discordId: interaction.user.id, verified: true });
        if (existing) {
            await interaction.reply({ content: '✅ You are already verified!', flags: 64 });
            return;
        }
        const crypto = require('crypto');
        const secret = 'tB87#kPtkxqOS2';
        let player = null;
        try {
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
            player = data.data;
            if (!player || !player.nickname) {
                await interaction.reply({ content: '❌ No player found for this FID!', flags: 64 });
                return;
            }
        } catch (e) {
            console.error('Verification error:', e);
            await interaction.reply({ content: '❌ An error occurred during the process!', flags: 64 });
            return;
        }
        const furnaceLevelName = getFurnaceLevelName(player.stove_lv);

        await User.findOneAndUpdate(
            { discordId: interaction.user.id },
            { discordId: interaction.user.id, gameId: fid, nickname: player.nickname, furnaceLevel: furnaceLevelName, verified: false, roles: [] },
            { upsert: true, new: true }
        );
        const guild = interaction.guild || await interaction.client.guilds.fetch(process.env.GUILD_ID);
        const leadersRole = guild.roles.cache.find(r => r.name.toLowerCase().includes('leader'));
        const verifyLogsChannel = guild.channels.cache.find(ch => ch.name.includes('verification-logs') && ch.isTextBased());
        if (leadersRole && verifyLogsChannel) {
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setTitle('New Verification Request')
                .setDescription(`User: <@${interaction.user.id}>
FID: ${fid}
Nickname: **${player.nickname}**
Furnace Level: **${furnaceLevelName}**`)
                .setColor(0x1e90ff)
                .setThumbnail(player.avatar_image)
                .setFooter({ text: `Manual approval required | ${brandingText}` });
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`approve_${interaction.user.id}`).setLabel('Approve').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_${interaction.user.id}`).setLabel('Reject').setStyle(ButtonStyle.Danger)
            );
            await verifyLogsChannel.send({ content: `${leadersRole}`, embeds: [embed], components: [row] });
        }
        const logger = require('../utils/logger');
        logger.logVerification(interaction.user, { fid, nickname: player.nickname, furnaceLevel: furnaceLevelName });
        await interaction.reply({ content: `✅ Verification request submitted! Leaders will review and approve you soon.`, flags: 64 });
      }
      else if (interaction.customId === 'reminder_modal') {
            await interaction.deferReply({ ephemeral: true });

            const description = interaction.fields.getTextInputValue('reminder_description');
            const timeQuery = interaction.fields.getTextInputValue('reminder_time');
            const channelName = interaction.fields.getTextInputValue('reminder_channel').replace('#', '');

            const channel = interaction.guild.channels.cache.find(ch => ch.name === channelName);
            if (!channel || !channel.isTextBased()) {
                return interaction.editReply({ content: `❌ Could not find a text channel named #${channelName}.` });
            }

            const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
            if (!GEMINI_API_KEY) {
                return interaction.editReply({ content: '❌ Cannot process time. The bot is missing its Gemini API key.' });
            }
            const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${GEMINI_API_KEY}`;
            const nowUTC = new Date();
            const timeConversionPrompt = `You are a precise time calculation assistant. Your task is to determine the exact future date and time in ISO 8601 format based on a natural language phrase.
The current date and time is exactly ${nowUTC.toISOString()}.
Analyze the user's phrase below and calculate the resulting absolute date and time.

User's phrase: "${timeQuery}"

Your output MUST be only the full ISO 8601 timestamp (YYYY-MM-DDTHH:mm:ss.sssZ) or the word "Error".
- If the phrase is "in 2 hours", calculate the time 2 hours from now and return the full ISO timestamp.
- If the phrase is "at 9pm EST", you must convert it to the correct UTC date and time and return the full ISO timestamp.
- If the phrase is a specific time like "21:00", assume it's for the current day in UTC. If that time has already passed today, assume it's for the next day.
- If a specific time cannot be determined, output the word "Error".`;

            const payload = {
                contents: [{ parts: [{ text: timeConversionPrompt }] }],
                generationConfig: { temperature: 0.0 }
            };

            try {
                const response = await fetch(GEMINI_API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                const isoString = result.candidates?.[0]?.content?.parts?.[0]?.text.trim();

                if (!isoString || isoString.toLowerCase() === 'error') {
                    return interaction.editReply({ content: `❌ I couldn't understand the time "${timeQuery}". Please be more specific (e.g., "14:30", "in 2 hours").` });
                }

                const futureDate = new Date(isoString);
                if (isNaN(futureDate.getTime())) {
                     return interaction.editReply({ content: `❌ I received an invalid date format from the AI. Please try rephrasing your time.` });
                }

                const utcHour = futureDate.getUTCHours().toString().padStart(2, '0');
                const utcMinute = futureDate.getUTCMinutes().toString().padStart(2, '0');
                const utcTime = `${utcHour}:${utcMinute}`;

                await Announcement.create({
                    guildId: interaction.guildId,
                    channelId: channel.id,
                    time: utcTime,
                    interval: 'ONCE',
                    content: description,
                    authorId: interaction.user.id
                });

                await interaction.editReply({ content: `✅ Reminder set! I will post a message in <#${channel.id}> at **${utcTime} UTC**.` });

            } catch (error) {
                console.error("Error processing reminder modal:", error);
                await interaction.editReply({ content: 'An unexpected error occurred while setting the reminder.' });
            }
      }
    }

    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (command) await command.execute(interaction);
    }
  }
};