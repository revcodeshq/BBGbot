require('dotenv').config();
const { REST, Routes, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { get } = require('../utils/config');
const Timer = require('../database/models.Timer'); // <-- ADDED
const HelpMessage = require('../database/models.HelpMessage');
const { brandingText } = require('../utils/branding.js');
const { getStaticHelpEmbed } = require('../utils/help.js');
const { metrics } = require('../utils/metrics');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);
        
        // Set bot ready time for metrics
        metrics.setBotReadyTime();
        console.log('📊 Metrics system initialized');
        // Set a custom activity/status
    client.user.setActivity('👑 BBG Alliance | Type /help', { type: ActivityType.Watching });

        // Set bot avatar to guild icon
        try {
            const guildId = get('discord.guildId');
            const guild = await client.guilds.fetch(guildId);
            if (guild && guild.iconURL()) {
                const iconUrl = guild.iconURL({ extension: 'png', size: 512 });
                
                // Download the image as a buffer with better error handling
                const axios = require('axios');
                const response = await axios.get(iconUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 10000, // 10 second timeout
                    maxContentLength: 8 * 1024 * 1024 // 8MB max size
                });
                
                const imageBuffer = Buffer.from(response.data, 'binary');
                
                // Validate image buffer size (Discord limit is 8MB)
                if (imageBuffer.length > 8 * 1024 * 1024) {
                    console.warn('Guild icon too large, skipping avatar update.');
                    return;
                }
                
                // Validate image buffer is not empty
                if (imageBuffer.length === 0) {
                    console.warn('Guild icon buffer is empty, skipping avatar update.');
                    return;
                }
                
                await client.user.setAvatar(imageBuffer);
                console.log('Bot avatar updated to guild icon.');
            } else {
                console.warn('Guild icon not found or guild fetch failed.');
            }
        } catch (err) {
            if (err.code === 50035) {
                console.warn('Discord API rejected avatar update (invalid format/size), skipping.');
            } else if (err.code === 429) {
                console.warn('Rate limited while updating avatar, skipping.');
            } else {
                console.error('Failed to set bot avatar to guild icon:', err.message);
            }
        }

        // --- Persistent Bot Info Message ---
        try {
            const BotInfoMessage = require('../database/models/BotInfoMessage');
            const { generateBotInfoEmbed } = require('../utils/bot-info.js');
            const botInfoDoc = await BotInfoMessage.findOne({ guildId: get('discord.guildId') });
            if (botInfoDoc) {
                const channel = await client.channels.fetch(botInfoDoc.channelId);
                let infoMessage;
                try {
                    infoMessage = await channel.messages.fetch(botInfoDoc.messageId);
                } catch (fetchError) {
                    if (fetchError.code === 10008) {
                        console.warn('Bot info message was deleted, removing from database.');
                        await BotInfoMessage.findOneAndDelete({ guildId: get('discord.guildId') });
                        return;
                    }
                    infoMessage = null;
                }
                const infoEmbed = await generateBotInfoEmbed(client);
                if (infoMessage) {
                    // Update the embed to keep info fresh
                    await infoMessage.edit({ embeds: [infoEmbed] });
                    console.log('Bot info message found and updated.');
                } else {
                    // Message missing, re-send and update DB
                    const newMsg = await channel.send({ embeds: [infoEmbed] });
                    await BotInfoMessage.findOneAndUpdate(
                        { guildId: channel.guild.id },
                        {
                            guildId: channel.guild.id,
                            channelId: channel.id,
                            messageId: newMsg.id,
                        },
                        { upsert: true, new: true }
                    );
                    console.log('Bot info message was missing and has been restored.');
                }
            }
        } catch (err) {
            if (err.code === 10008) {
                console.warn('Bot info message not found, removing from database.');
                await BotInfoMessage.findOneAndDelete({ guildId: get('discord.guildId') });
            } else {
                console.error('Error restoring/updating persistent bot info message:', err);
            }
        }

        // Collect all command data
        const commands = [];
        const commandsPath = path.join(__dirname, '..', 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const command = require(path.join(commandsPath, file));
            commands.push(command.data.toJSON());
        }

        const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN || client.token);
        try {
            // Register commands for the guild
            await rest.put(
                Routes.applicationGuildCommands(client.user.id, get('discord.guildId')),
                { body: commands }
            );
            console.log('Successfully registered gui    ld application commands.');
        } catch (error) {
            console.error('Error registering commands:', error);
        }

        try {
            const helpMessageDoc = await HelpMessage.findOne({ guildId: get('discord.guildId') });
            if (helpMessageDoc) {
                const channel = await client.channels.fetch(helpMessageDoc.channelId);
                let message;
                
                try {
                    message = await channel.messages.fetch(helpMessageDoc.messageId);
                } catch (fetchError) {
                    if (fetchError.code === 10008) {
                        console.warn('Persistent help message was deleted, removing from database.');
                        await HelpMessage.findOneAndDelete({ guildId: get('discord.guildId') });
                        return;
                    }
                    throw fetchError;
                }
                
                const helpEmbed = getStaticHelpEmbed();
                await message.edit({ embeds: [helpEmbed] });
                console.log('Persistent help message updated.');
            }
        } catch (error) {
            if (error.code === 10008) {
                console.warn('Persistent help message not found, removing from database.');
                await HelpMessage.findOneAndDelete({ guildId: get('discord.guildId') });
            } else {
                console.error('Error updating persistent help message:', error);
            }
        }

        // Static verify button message in verification channel
        const verifyChannelName = '✅-verify'; // Change to your actual channel name if needed
        const verifyChannel = client.channels.cache.find(ch => ch.name.includes(verifyChannelName) && ch.isTextBased());
        if (verifyChannel) {
            const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
            const staticContent = {
                embeds: [
                    new EmbedBuilder()
                        .setTitle('🔥 Alliance Member Verification')
                        .setDescription('Welcome to **BBG**!\n\nTo join our ranks and access all alliance features, please verify your Whiteout Survival account.\n\n**How to verify:**\nClick the button below and follow the instructions. Leaders will approve your request.\n\n**Why verify?**\n- Unlock member chat & events\n- Get access to alliance resources\n- Track your progress and achievements\n\n*Your privacy is protected. Only leaders see your game info.*')
                        .setColor(0x1e90ff)
                        .setThumbnail('https://cdn.discordapp.com/icons/your-server-id/your-icon.png') // Replace with your server icon URL
                        .setImage('https://static.wikia.nocookie.net/whiteout-survival/images/7/7e/Whiteout_Survival_banner.jpg') // Replace with a cool game image
                        .addFields(
                            { name: 'Need help?', value: 'DM a Leader!', inline: false }
                        )
                        .setFooter({ text: 'BBG', iconURL: 'https://cdn.discordapp.com/icons/your-server-id/your-icon.png' })
                ],
                components: [
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('start_verification')
                            .setLabel('✅ Start Verification')
                            .setStyle(ButtonStyle.Success)
                    )
                ]
            };
            // Find existing bot message
            const messages = await verifyChannel.messages.fetch({ limit: 10 });
            const botMsg = messages.find(m => m.author.id === client.user.id && m.components.length > 0 && m.components[0].components[0].customId === 'start_verification');
            if (botMsg) {
                await botMsg.edit(staticContent);
            } else {
                await verifyChannel.send(staticContent);
            }
        } else {
            console.warn('Verification channel not found. Please check the channel name.');
        }

        // --- PERSONAL TIMER CHECKER ---
        // This loop runs every 30 seconds to check for expired timers.
        setInterval(async () => {
            const now = new Date();
            // Find timers that are due
            const expiredTimers = await Timer.find({ endTime: { $lte: now } });

            if (expiredTimers.length === 0) {
                return;
            }

            for (const timer of expiredTimers) {
                try {
                    const user = await client.users.fetch(timer.userId);
                    if (user) {
                        await user.send(`⏰ **Timer Complete!**\nYour timer for **"${timer.timerName}"** has finished.`);
                    }
                } catch (error) {
                    console.error(`Failed to send timer DM to user ${timer.userId}:`, error);
                    // Optional: Add fallback logic here, e.g., message in the original channel
                } finally {
                    // Delete the timer from the database after processing
                    await Timer.findByIdAndDelete(timer._id);
                }
            }
        }, 30 * 1000); // Check every 30 seconds
        console.log('Personal timer checking loop started.');
    },
};