require('dotenv').config();
const { REST, Routes, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const GUILD_ID = process.env.GUILD_ID || '1421956605787770913';
const Timer = require('../database/models.Timer'); // <-- ADDED
const HelpMessage = require('../database/models.HelpMessage');
const { brandingText } = require('../utils/branding.js');
const { getStaticHelpEmbed } = require('../utils/help.js');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        console.log(`Ready! Logged in as ${client.user.tag}`);
        // Set a custom activity/status
        client.user.setActivity('BBG Alliance', { type: ActivityType.Watching });

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
                Routes.applicationGuildCommands(client.user.id, GUILD_ID),
                { body: commands }
            );
            console.log('Successfully registered guild application commands.');
        } catch (error) {
            console.error('Error registering commands:', error);
        }

        try {
            const helpMessageDoc = await HelpMessage.findOne({ guildId: GUILD_ID });
            if (helpMessageDoc) {
                const channel = await client.channels.fetch(helpMessageDoc.channelId);
                const message = await channel.messages.fetch(helpMessageDoc.messageId);
                const helpEmbed = getStaticHelpEmbed();
                await message.edit({ embeds: [helpEmbed] });
                console.log('Persistent help message updated.');
            }
        } catch (error) {
            console.error('Error updating persistent help message:', error);
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