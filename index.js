const { Client, Collection, GatewayIntentBits, InteractionType } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const logger = require('./src/utils/logger'); // <-- IMPORT LOGGER
const { brandingText } = require('./src/utils/branding.js');
const { getFurnaceLevelName } = require('./src/utils/game-utils.js');
const { validateConfig, get } = require('./src/utils/config');

// Ensure dotenv is configured first
require('dotenv').config();

// Validate configuration
const missingConfig = validateConfig();
if (missingConfig.length > 0) {
	console.error('Missing required configuration:');
	missingConfig.forEach(key => console.error(`  - ${key}`));
	console.error('Please check your .env file and ensure all required variables are set.');
	process.exit(1);
}

// Mongoose Connection Setup
mongoose.connect(get('database.mongoUri')).then(() => {
	console.log('Connected to MongoDB');
}).catch(err => {
	console.error('MongoDB connection error:', err);
});

// Client Setup
const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildPresences,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.GuildMessageTyping,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.DirectMessageReactions,
        GatewayIntentBits.DirectMessageTyping,
        GatewayIntentBits.GuildIntegrations
	]
});
client.commands = new Collection();

// --- Command Loader ---
const commandsPath = path.join(__dirname, 'src', 'commands');
if (fs.existsSync(commandsPath)) {
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	for (const file of commandFiles) {
		const command = require(path.join(commandsPath, file));
		client.commands.set(command.data.name, command);
	}
}

// --- Event Loader ---
const eventsPath = path.join(__dirname, 'src', 'events');
if (fs.existsSync(eventsPath)) {
	const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
	for (const file of eventFiles) {
		const event = require(path.join(eventsPath, file));
		if (event.once) {
			client.once(event.name, (...args) => event.execute(...args, client));
		} else {
			client.on(event.name, (...args) => event.execute(...args, client));
		}
	}
}

// Login
client.login(process.env.BOT_TOKEN);

// --- Scheduled Nickname Sync and Announcement Checker ---
const User = require('./src/database/models.User');
const Announcement = require('./src/database/models.Announcements');




const { EmbedBuilder } = require('discord.js');

/**
 * Checks and processes scheduled announcements
 * Handles main announcements and warning messages (15m, 10m, 5m before)
 * Includes spam protection with 2-minute cooldown between sends
 * @param {Client} client - Discord.js client instance
 */
async function checkSchedules(client) {
    const now = new Date();
    
    // Utility to get UTC time string offset by minutes.
    // We look for schedules that are due in 5, 10, or 15 minutes from now.
    const getOffsetTimeUTC = (offsetMinutes) => {
        // Add milliseconds corresponding to the offset
        const future = new Date(now.getTime() + offsetMinutes * 60000); 
        const futureHour = future.getUTCHours().toString().padStart(2, '0');
        const futureMinute = future.getUTCMinutes().toString().padStart(2, '0');
        return `${futureHour}:${futureMinute}`;
    };

    // Calculate the current UTC time and day
    const currentUTCHour = now.getUTCHours().toString().padStart(2, '0');
    const currentUTCMinute = now.getUTCMinutes().toString().padStart(2, '0');
    
    const currentTimeUTC = `${currentUTCHour}:${currentUTCMinute}`;
    const currentUTCDayOfWeek = now.getUTCDay(); // 0 (Sunday) to 6 (Saturday)

    // Calculate the exact time strings for 15m, 10m, and 5m warnings
    const time15mWarning = getOffsetTimeUTC(15);
    const time10mWarning = getOffsetTimeUTC(10);
    const time5mWarning = getOffsetTimeUTC(5);

    // --- Safety Cooldown Settings ---
    // Enforce a 2-minute delay after any send (warning or main event) to prevent spam 
    // if the scheduler runs multiple times within the same minute.
    const WARNING_COOLDOWN_MS = 2 * 60 * 1000; 

    try {
        // Query the database for announcements matching the current exact time 
        // OR any of the warning times in a single efficient query.
        const announcements = await Announcement.find({ 
            time: { $in: [currentTimeUTC, time15mWarning, time10mWarning, time5mWarning] } 
        });

        for (const ann of announcements) {
            const lastSent = ann.lastSent ? new Date(ann.lastSent) : null;
            let shouldSend = false;
            let messageType = 'main'; // 'main', '15m_warn', '10m_warn', '5m_warn'

            // --- UNIVERSAL SPAM CHECK (2-minute cooldown) ---
            // If the last send (warning or main) was less than 2 minutes ago, skip.
            // This is the primary defense against spam as requested.
            if (lastSent && (now.getTime() - lastSent.getTime()) < WARNING_COOLDOWN_MS) {
                console.log(`[Scheduler] Skipping ID ${ann._id}: Cooldown active.`);
                continue; 
            }
            
            // Utility to check if announcement was sent today (in UTC)
            const wasSentTodayUTC = lastSent && 
                                    lastSent.getUTCFullYear() === now.getUTCFullYear() && 
                                    lastSent.getUTCMonth() === now.getUTCMonth() &&
                                    lastSent.getUTCDate() === now.getUTCDate();

            // --- Recurrence Check Utility ---
            let isDueToFire = false;
            
            // We only apply the full recurrence check if the last send was long ago (outside 16 minutes).
            // This prevents a recent warning from breaking the next day/week recurrence check.
            const LONG_TERM_CHECK_MS = 16 * 60 * 1000;
            const lastSentWasLongAgo = !lastSent || (now.getTime() - lastSent.getTime()) >= LONG_TERM_CHECK_MS;

            if (ann.interval === 'ONCE' && !lastSent) {
                isDueToFire = true;
            } else if (lastSentWasLongAgo) {
                // If the last send was long ago, check full recurrence logic:
                if (ann.interval === 'DAILY' && !wasSentTodayUTC) {
                    isDueToFire = true;
                } else if (ann.interval === 'WEEKLY' && ann.dayOfWeek === currentUTCDayOfWeek && !wasSentTodayUTC) {
                    isDueToFire = true;
                } else if (ann.interval === 'CUSTOM_DAYS' && ann.daysInterval && (!lastSent || Math.floor((now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24)) >= ann.daysInterval)) {
                    isDueToFire = true;
                } else if (ann.interval === 'CUSTOM_WEEKS' && ann.weeksInterval && (!lastSent || Math.floor((now.getTime() - lastSent.getTime()) / (1000 * 60 * 60 * 24 * 7)) >= ann.weeksInterval)) {
                    isDueToFire = true;
                }
            } else {
                 // If lastSent was recent (within 16 minutes), we assume the initial recurrence check passed,
                 // and we are simply waiting for the next sequential warning or main event time to match.
                isDueToFire = true;
            }


            // --- Determine Send Status and Type ---
            if (isDueToFire) {
                // Determine if the current time matches the main time or one of the warning times
                if (ann.time === currentTimeUTC) {
                    shouldSend = true;
                    messageType = 'main';
                } else if (ann.time === time15mWarning) {
                    shouldSend = true;
                    messageType = '15m_warn';
                } else if (ann.time === time10mWarning) {
                    shouldSend = true;
                    messageType = '10m_warn';
                } else if (ann.time === time5mWarning) {
                    shouldSend = true;
                    messageType = '5m_warn';
                }
            }


            if (shouldSend) {
                // Fetch the guild, in case the bot was kicked from it.
                const guild = await client.guilds.fetch(ann.guildId).catch(() => null);
                if (!guild) {
                    console.log(`[Scheduler] Guild ${ann.guildId} not found or inaccessible for announcement ID ${ann._id}. Deleting.`);
                    await ann.deleteOne(); // Clean up invalid record
                    continue; // Skip to next announcement
                }
                
                const channel = await guild.channels.fetch(ann.channelId).catch(() => null);

                if (channel && channel.isTextBased()) {
                    let logAction = '';
                    // The role mention is extracted here to be used in the 'content' field for the ping.
                    let roleMention = ann.roleId ? `<@&${ann.roleId}>` : '';
                    let sendEmbed;

                    // --- Embed Construction ---
                    
                    if (messageType === 'main') {
                        // Main Announcement Embed (Professional Look: Green)
                        logAction = ann.interval === 'ONCE' ? 'One-Time Announcement Sent' : 'Recurring Announcement Sent';
                        
                        sendEmbed = new EmbedBuilder()
                            .setTitle('📢 Scheduled Announcement')
                            .setDescription(ann.content)
                            .setColor(0x32CD32) // Lime Green for main event
                            .addFields({ 
                                name: '⏰ Schedule', 
                                value: `Interval: **${ann.interval}** | Time: \`${ann.time}\` UTC`, 
                                inline: true 
                            })
                            .setTimestamp(now)
                            .setFooter({ text: brandingText });

                    } else {
                        // Warning Embeds (Better Look: Orange)
                        const remainingMinutes = messageType === '15m_warn' ? 15 : (messageType === '10m_warn' ? 10 : 5);
                        
                        const warningText = remainingMinutes === 5 
                            ? `🚨 Final warning! This scheduled message is coming up in **${remainingMinutes} minutes** at \`${ann.time}\` UTC.`
                            : `Heads up! This scheduled message is coming up in **${remainingMinutes} minutes** at \`${ann.time}\` UTC.`;
                        
                        logAction = `${remainingMinutes}m Warning Sent`;
                        
                        sendEmbed = new EmbedBuilder()
                            .setTitle(`⚠️ Event Reminder (${remainingMinutes} Minutes Left)`)
                            .setDescription(warningText)
                            .setColor(0xFFA500) // Orange for warning
                            .setTimestamp(now)
                            .setFooter({ text: `Scheduled Event Time: ${ann.time} UTC` });
                    }
                    
                    // --- Send Embed Message ---
                    // Send the role mention as content for a proper ping, and the styled message as an embed.
                    await channel.send({ 
                        content: roleMention, // Triggers the actual notification/ping
                        embeds: [sendEmbed] // Holds the beautiful message content
                    }).catch(sendError => {
                        console.error(`[Scheduler ERROR] Failed to send message to channel ${channel.name} (${channel.id}):`, sendError.message);
                        // Log message sending failure
                        const logDetails = `ID: \`${ann._id}\`\nChannel: ${channel.name}\nInterval: ${ann.interval}\nError: ${sendError.message}`;
                        logger.logBotActivity("Announcement Send Failure", logDetails, client);
                    });

                    // --- Database Update/Delete Logic ---
                    
                    if (ann.interval === 'ONCE' && messageType === 'main') {
                        // For one-time schedules, delete immediately after the MAIN event sends
                        await ann.deleteOne();
                        console.log(`[Scheduler] Sent and deleted one-time announcement ID ${ann._id}`);
                        logAction += ' & Deleted'; // Update log action
                    } 
                    
                    // Update lastSent for ALL sends (warnings and recurring mains) to enforce the 2-minute cooldown.
                    if (ann.interval !== 'ONCE' || messageType !== 'main') {
                        ann.lastSent = now;
                        await ann.save();
                        console.log(`[Scheduler] Sent ${messageType} for ID ${ann._id}. Updated lastSent for cooldown.`);
                    }
                        
                    // Log the activity (Warnings and Main Sends)
                    const logDetails = `ID: \`${ann._id}\`\nChannel: ${channel.name}\nInterval: ${ann.interval}\nScheduled Time: ${ann.time}\nRole: ${ann.roleId ? `<@&${ann.roleId}>` : 'None'}`;
                    logger.logBotActivity(logAction, logDetails, client);

                } else {
                    console.warn(`[Scheduler WARNING] Channel ${ann.channelId} not found or is not a text channel. Announcement ID ${ann._id}.`);
                }
            }
        }
    } catch (error) {
        console.error('[Scheduler FATAL ERROR] Failed to check or process schedules:', error);
        // Log general scheduler processing failure
        const logDetails = `Error: ${error.message}\nStack: ${error.stack ? error.stack.split('\n')[1] : 'N/A'}`;
        logger.logBotActivity("[ERROR] Scheduler Processing Failure", logDetails, client);
    }
}


// --- NICKNAME SYNC LOGIC ---
let consecutiveApiFailures = 0;
const maxApiFailures = 5;

async function runNicknameSync(client) {
	console.log('[Nickname Sync] Running background sync...');
	
	// Skip sync if API has been consistently failing
	if (consecutiveApiFailures >= maxApiFailures) {
		console.warn(`[Nickname Sync] Skipping sync due to ${consecutiveApiFailures} consecutive API failures. API may be down.`);
		return;
	}
	
	const guild = client.guilds.cache.get(process.env.GUILD_ID);
	if (!guild) {
		console.warn('GUILD_ID not found in cache. Skipping nickname sync.');
		return;
	}

	const users = await User.find({ verified: true });
	let apiFailuresThisRun = 0;
	for (const user of users) {
		try {
			// Fetch the member, gracefully handling if they have left
			const member = await guild.members.fetch({ user: user.discordId, force: false });
			if (!member) continue; // Skip if user is no longer in the guild
			
			// Skip guild owner - they shouldn't have their nickname changed
			if (member.id === guild.ownerId) {
				continue;
			}
			let nickname = null;
			let furnace = '';

			if (user.gameId) {
				const currentTime = Date.now();
				const secret = process.env.WOS_API_SECRET || 'tB87#kPtkxqOS2'; // Use secret from env or default
				const baseForm = `fid=${user.gameId}&time=${currentTime}`;
				const sign = crypto.createHash('md5').update(baseForm + secret).digest('hex');
				const fullForm = `sign=${sign}&${baseForm}`;

				try {
					const response = await fetch('https://wos-giftcode-api.centurygame.com/api/player', {
						method: 'POST',
						headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
						body: fullForm
					});

					// Check if we got HTML instead of JSON (API error/maintenance)
					const contentType = response.headers.get('content-type');
					if (!contentType || !contentType.includes('application/json')) {
						console.warn(`[Nickname Sync] API returned non-JSON response for FID ${user.gameId}. Likely maintenance or error page.`);
						continue; // Skip this user, keep existing nickname
					}

					const data = await response.json();

					if (data && data.data && data.data.nickname) {
						nickname = data.data.nickname;
						if (data.data.stove_lv) {
							furnace = getFurnaceLevelName(data.data.stove_lv);
						}
					} else if (data && data.code !== 0) {
						console.warn(`[Nickname Sync] API error for FID ${user.gameId}: ${data.msg || 'Unknown error'}`);
						continue; // Skip this user
					}
				} catch (apiErr) {
					// Handle specific JSON parsing errors
					if (apiErr.message.includes('Unexpected token') && apiErr.message.includes('DOCTYPE')) {
						console.warn(`[Nickname Sync] API returned HTML page instead of JSON for FID ${user.gameId}. API may be down or in maintenance.`);
					} else {
						console.error(`[Nickname Sync] API error for FID ${user.gameId}:`, apiErr.message);
					}
					apiFailuresThisRun++;
					continue; // Skip this user, don't change their nickname
				}
			}

			// Assemble the final nickname string
			if (nickname) {
				let finalNickname = furnace ? `${nickname} | ${furnace}` : nickname;
				// Discord nickname max length is 32 characters
				if (finalNickname.length > 32) finalNickname = finalNickname.slice(0, 32);

				// Only update if the nickname is different to avoid API spam
				if (member.nickname !== finalNickname) {
					await member.setNickname(finalNickname, 'Automated Nickname Sync');
				}
			}

		} catch (err) {
			// Error code 10007 (Unknown User) is handled by fetch, but this catches other permission errors
			if (err.code === 50013) {
				console.warn(`[Nickname Sync] Missing permissions to change nickname for ${user.discordId}. Ensure bot role is high.`);
			} else if (err.code !== 10007) {
				console.error(`[Nickname Sync] Failed to update nickname for ${user.discordId}:`, err.message);
			}
		}
	}
	
	// Update failure tracking
	if (apiFailuresThisRun > users.length * 0.8) { // If more than 80% of users failed
		consecutiveApiFailures++;
		console.warn(`[Nickname Sync] High failure rate: ${apiFailuresThisRun}/${users.length} users failed. Consecutive failures: ${consecutiveApiFailures}`);
	} else {
		consecutiveApiFailures = 0; // Reset on successful run
		if (apiFailuresThisRun > 0) {
			console.log(`[Nickname Sync] Completed with ${apiFailuresThisRun} failures. API appears to be working.`);
		}
	}
}


// --- Bot Ready Event ---
client.once('clientReady', async () => {
	// 1. Start the Announcement Scheduler (runs every minute)
	console.log('[Scheduler] Background announcement checker started.');
	setInterval(() => checkSchedules(client), 10 * 1000);

	// 2. Start the Nickname Sync (runs every 10 minutes)
	console.log('[Nickname Sync] Background checker started.');
	// Run once on start, then repeat every 10 minutes
	runNicknameSync(client);
	setInterval(() => runNicknameSync(client), 10 * 60 * 1000);

    // 3. Start the Bot Info updater
    require('./src/tasks/updateBotInfo.js')(client);
    require('./src/tasks/giveaway-ender.js')(client);
    require('./src/tasks/poll-ender.js')(client);
});
