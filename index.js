
/**
 * BBG Discord Bot - Main Entry
 * Professional release version
 * Author: Rev
 * License: MIT
 */

const { Client, Collection, GatewayIntentBits } = require('discord.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Core utilities (loaded first)
const logger = require('./src/utils/logger');
const productionLogger = require('./src/utils/production-logger');
const ProductionValidator = require('./src/utils/production-validator');
const HealthCheckSystem = require('./src/utils/health-check');
const { brandingText } = require('./src/utils/branding.js');
const { getFurnaceLevelName } = require('./src/utils/game-utils.js');
const { validateConfig, get } = require('./src/utils/config');
const { ErrorHandler } = require('./src/utils/error-handler');
const { metrics } = require('./src/utils/metrics');
const { startupOptimizer } = require('./src/utils/startup-optimizer');
const { discordOptimizer } = require('./src/utils/discord-optimizer');
const { performanceMonitor } = require('./src/utils/performance-monitor');
const { advancedCache } = require('./src/utils/advanced-cache');
const { smartRateLimiter } = require('./src/utils/smart-rate-limiter');

require('dotenv').config();

// Production environment validation
if (process.env.NODE_ENV === 'production') {
    const validator = new ProductionValidator();
    const validation = validator.generateProductionReport();
    
    if (!validation.isValid) {
        productionLogger.error('Production environment validation failed', {
            errors: validation.errors,
            warnings: validation.warnings
        });
        process.exit(1);
    }
    
    productionLogger.info('Production environment validation passed');
}

// Validate configuration
const missingConfig = validateConfig();
if (missingConfig.length > 0) {
    productionLogger.error('Missing required configuration', { missingConfig });
    console.error('Missing required configuration:');
    missingConfig.forEach(key => console.error(`  - ${key}`));
    console.error('Please check your .env file and ensure all required variables are set.');
    process.exit(1);
}

// Robust MongoDB connection with automatic retry
let mongoConnected = false;
const mongodbManager = require('./src/utils/mongodb-manager');

// Set up MongoDB connection with retry logic
startupOptimizer.connectMongoDB(get('database.mongoUri'))
    .then((success) => {
        mongoConnected = success;
        if (success) {
            console.log('[Startup] MongoDB connection confirmed');
        } else {
            console.log('[Startup] MongoDB connection will be retried automatically');
        }
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        // Don't exit immediately, let the MongoDB manager handle reconnection
        console.log('[Startup] Bot will continue with automatic MongoDB reconnection');
    });

// Monitor MongoDB connection state
mongodbManager.addConnectionListener((event, data) => {
    if (event === 'connected' || event === 'reconnected') {
        mongoConnected = true;
        console.log('[MongoDB] Connection state updated: connected');
    } else if (event === 'disconnected' || event === 'error') {
        mongoConnected = false;
        console.log('[MongoDB] Connection state updated: disconnected');
    }
});

// Discord Client Setup with optimized intents
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

// Optimized Command and Event Loading
async function initializeBot() {
    try {
        console.log('[Startup] Initializing bot with optimized loading...');
        
        // Create lazy loaders
        const commandsPath = path.join(__dirname, 'src', 'commands');
        const eventsPath = path.join(__dirname, 'src', 'events');
        
        const commandLoader = startupOptimizer.createLazyCommandLoader(commandsPath);
        const eventLoader = startupOptimizer.createLazyEventLoader(eventsPath);
        
        // Load critical events first
        await eventLoader.loadCriticalEvents(client);
        
        // Load all commands in parallel
        const allCommands = await commandLoader.getAllCommands();
        allCommands.forEach((command, name) => {
            client.commands.set(name, command);
        });
        
        console.log(`[Startup] Loaded ${allCommands.size} commands`);
        
        // Login to Discord
        await client.login(process.env.BOT_TOKEN);
        
        // Load optional events after login
        await eventLoader.loadOptionalEvents(client);
        
        console.log('[Startup] Bot initialization completed successfully');
        
        // Initialize health check system
        client.healthCheck = new HealthCheckSystem(client);
        productionLogger.info('Health check system initialized');
        
        // Set up graceful shutdown handlers
        setupGracefulShutdown(client);
        
    } catch (error) {
        productionLogger.error('Bot initialization failed', { error: error.message, stack: error.stack });
        console.error('[Startup] Bot initialization failed:', error);
        process.exit(1);
    }
}

/**
 * Sets up graceful shutdown handling
 */
function setupGracefulShutdown(client) {
    const gracefulShutdown = async (signal) => {
        productionLogger.info(`Received ${signal}, shutting down gracefully`);
        
        try {
            // Stop accepting new connections
            if (client.isReady()) {
                productionLogger.info('Disconnecting from Discord...');
                await client.destroy();
            }
            
            // Close database connections
            productionLogger.info('Closing database connection...');
            await mongodbManager.disconnect();
            
            // Stop health monitoring
            if (client.healthCheck) {
                productionLogger.info('Stopping health monitoring...');
                // Health check system cleanup would go here
            }
            
            productionLogger.info('Graceful shutdown completed');
            process.exit(0);
            
        } catch (error) {
            productionLogger.error('Error during graceful shutdown', { error: error.message });
            process.exit(1);
        }
    };
    
    // Handle different shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));
}

// Start initialization
initializeBot();

// Global error handlers to prevent crashes
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit the process, just log the error
});

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
    // Check MongoDB connection before proceeding
    if (!await mongodbManager.isHealthy()) {
        console.warn('[Scheduler] MongoDB not healthy, skipping schedule check');
        return;
    }
    
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
        // Use MongoDB manager's retry mechanism for database operations
        const announcements = await mongodbManager.executeWithRetry(async () => {
            return await Announcement.find({ 
                time: { $in: [currentTimeUTC, time15mWarning, time10mWarning, time5mWarning] } 
            });
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
                        await mongodbManager.executeWithRetry(async () => {
                            await ann.deleteOne();
                        });
                        console.log(`[Scheduler] Sent and deleted one-time announcement ID ${ann._id}`);
                        logAction += ' & Deleted'; // Update log action
                    } 
                    
                    // Update lastSent for ALL sends (warnings and recurring mains) to enforce the 2-minute cooldown.
                    if (ann.interval !== 'ONCE' || messageType !== 'main') {
                        ann.lastSent = now;
                        await mongodbManager.executeWithRetry(async () => {
                            await ann.save();
                        });
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
	
	// Check MongoDB connection before proceeding
	if (!await mongodbManager.isHealthy()) {
		console.warn('[Nickname Sync] MongoDB not healthy, skipping sync');
		return;
	}
	
	// Skip sync if API has been consistently failing
	if (consecutiveApiFailures >= maxApiFailures) {
		console.warn(`[Nickname Sync] Skipping sync due to ${consecutiveApiFailures} consecutive API failures. API may be down.`);
		return;
	}
	
	const guild = client.guilds.cache.get(get('discord.guildId'));
	if (!guild) {
		console.warn('GUILD_ID not found in cache. Skipping nickname sync.');
		return;
	}

	const users = await mongodbManager.executeWithRetry(async () => {
		return await User.find({ verified: true });
	});
	
	// Use optimized batch processing for nickname sync
	const nicknameUpdates = users.map(user => ({
		userId: user.discordId,
		nickname: null // Will be set below
	}));

	// Batch fetch all members first
	const memberMap = await discordOptimizer.batchFetchMembers(guild, users.map(u => u.discordId), false);
	
	// Process nickname updates
	const syncResults = [];
	for (const user of users) {
		try {
			const member = memberMap.get(user.discordId);
			if (!member) {
				syncResults.push({ success: false, reason: 'User not in guild' });
				continue;
			}
			
			// Skip guild owner - they shouldn't have their nickname changed
			if (member.id === guild.ownerId) {
				syncResults.push({ success: false, reason: 'Guild owner' });
				continue;
			}
			
			let nickname = null;
			let furnace = '';

			if (user.gameId) {
				const currentTime = Date.now();
				const secret = get('api.wosApiSecret');
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
						return { success: false, reason: 'API maintenance' };
					}

					const data = await response.json();

					if (data && data.data && data.data.nickname) {
						nickname = data.data.nickname;
						if (data.data.stove_lv) {
							furnace = getFurnaceLevelName(data.data.stove_lv);
						}
					} else if (data && data.code !== 0) {
						console.warn(`[Nickname Sync] API error for FID ${user.gameId}: ${data.msg || 'Unknown error'}`);
						return { success: false, reason: 'API error' };
					}
				} catch (apiErr) {
					// Handle specific JSON parsing errors
					if (apiErr.message.includes('Unexpected token') && apiErr.message.includes('DOCTYPE')) {
						console.warn(`[Nickname Sync] API returned HTML page instead of JSON for FID ${user.gameId}. API may be down or in maintenance.`);
					} else {
						console.error(`[Nickname Sync] API error for FID ${user.gameId}:`, apiErr.message);
					}
					return { success: false, reason: 'API error', error: apiErr };
				}
			}

			// Assemble the final nickname string
			if (nickname) {
				let finalNickname = furnace ? `${nickname} | ${furnace}` : nickname;
				// Discord nickname max length is 32 characters
				if (finalNickname.length > 32) finalNickname = finalNickname.slice(0, 32);

				// Only update if the nickname is different to avoid API spam
				if (member.nickname !== finalNickname) {
					syncResults.push({ success: true, nickname: finalNickname, userId: user.discordId });
				} else {
					syncResults.push({ success: true, reason: 'No change needed' });
				}
			} else {
				syncResults.push({ success: false, reason: 'No nickname data' });
			}

		} catch (err) {
			// Error code 10007 (Unknown User) is handled by fetch, but this catches other permission errors
			if (err.code === 50013) {
				console.warn(`[Nickname Sync] Missing permissions to change nickname for ${user.discordId}. Ensure bot role is high.`);
				syncResults.push({ success: false, reason: 'Permission error' });
			} else if (err.code !== 10007) {
				console.error(`[Nickname Sync] Failed to update nickname for ${user.discordId}:`, err.message);
				syncResults.push({ success: false, reason: 'Unknown error', error: err });
			} else {
				syncResults.push({ success: false, reason: 'User not found' });
			}
		}
	}

	// Batch update nicknames for efficiency
	const updatesToProcess = syncResults
		.filter(result => result.success && result.nickname)
		.map(result => ({ userId: result.userId, nickname: result.nickname }));

	if (updatesToProcess.length > 0) {
		const batchResults = await discordOptimizer.batchUpdateNicknames(guild, updatesToProcess);
		console.log(`[Nickname Sync] Batch updated ${batchResults.filter(r => r.success).length} nicknames`);
	}
	
	// Process results and update failure tracking
	let apiFailuresThisRun = 0;
	let successfulUpdates = 0;
	
	for (const result of syncResults) {
		if (!result.success) {
			if (result.reason === 'API error' || result.reason === 'API maintenance') {
				apiFailuresThisRun++;
			}
		} else if (result.nickname) {
			successfulUpdates++;
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
	
	console.log(`[Nickname Sync] Completed: ${successfulUpdates} nicknames updated, ${apiFailuresThisRun} API failures`);
}


// --- Bot Ready Event ---
client.once('clientReady', async () => {
	// Wait for MongoDB connection before starting background tasks
	if (!mongoConnected) {
		console.log('[Startup] Waiting for MongoDB connection...');
		// Wait up to 10 seconds for MongoDB connection
		let attempts = 0;
		while (!mongoConnected && attempts < 100) {
			await new Promise(resolve => setTimeout(resolve, 100));
			attempts++;
		}
		
		if (!mongoConnected) {
			console.error('[Startup] MongoDB connection timeout - background tasks will be delayed');
		}
	}

	// Set bot ready time for metrics
	metrics.setBotReadyTime();
	
	// Only start background tasks if MongoDB is connected
	if (mongoConnected) {
		// 1. Start the Announcement Scheduler (runs every minute)
		console.log('[Scheduler] Background announcement checker started.');
		setInterval(() => checkSchedules(client), 10 * 1000);

		// 2. Start the Nickname Sync (runs every 10 minutes)
		console.log('[Nickname Sync] Background checker started.');
		// Run once on start, then repeat every 10 minutes
		runNicknameSync(client);
		setInterval(() => runNicknameSync(client), 10 * 60 * 1000);
	} else {
		console.log('[Startup] Background tasks delayed - MongoDB not connected');
	}

    // 3. Start the Giveaway and Poll Enders
    require('./src/tasks/giveaway-ender.js')(client);
    require('./src/tasks/poll-ender.js')(client);

    // 4. Start periodic event schedule embed updater
    const Announcement = require('./src/database/models.Announcements');
    const DisplayMessage = require('./src/database/models.DisplayMessage');
    const { EmbedBuilder } = require('discord.js');
    const { get } = require('./src/utils/config');
    const getIntervalDisplayName = (ann) => {
        switch (ann.interval) {
            case 'ONCE': return 'One-Time';
            case 'DAILY': return 'Daily';
            case 'WEEKLY': {
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                return `Weekly (Every ${days[ann.dayOfWeek]})`;
            }
            case 'CUSTOM_DAYS': return `Every ${ann.daysInterval} Days`;
            case 'CUSTOM_WEEKS': return `Every ${ann.weeksInterval} Weeks`;
            default: return ann.interval;
        }
    };
    const calculateNextRunDate = (ann, now) => {
        const [targetHour, targetMinute] = ann.time.split(':').map(Number);
        let nextRun = new Date(now);
        nextRun.setUTCHours(targetHour, targetMinute, 0, 0);
        if (ann.interval === 'ONCE') {
            if (nextRun < now) return null;
            return nextRun;
        }
        if (ann.interval === 'DAILY') {
            if (nextRun < now) nextRun.setUTCDate(nextRun.getUTCDate() + 1);
            return nextRun;
        }
        if (ann.interval === 'WEEKLY') {
            const targetDay = ann.dayOfWeek;
            const nowDay = now.getUTCDay();
            let dayDifference = targetDay - nowDay;
            if (dayDifference < 0) dayDifference += 7;
            else if (dayDifference === 0 && nextRun < now) dayDifference = 7;
            nextRun.setUTCDate(nextRun.getUTCDate() + dayDifference);
            return nextRun;
        }
        if (ann.interval === 'CUSTOM_DAYS' && ann.daysInterval) {
            let baseDate = ann.lastSent ? new Date(ann.lastSent) : now;
            baseDate.setUTCHours(targetHour, targetMinute, 0, 0);
            if (baseDate < now) {
                baseDate.setUTCDate(baseDate.getUTCDate() + ann.daysInterval);
            }
            return baseDate;
        }
        if (ann.interval === 'CUSTOM_WEEKS' && ann.weeksInterval) {
            let baseDate = ann.lastSent ? new Date(ann.lastSent) : now;
            baseDate.setUTCHours(targetHour, targetMinute, 0, 0);
            if (baseDate < now) {
                baseDate.setUTCDate(baseDate.getUTCDate() + (ann.weeksInterval * 7));
            }
            return baseDate;
        }
        return null;
    };

    async function updateEventScheduleEmbed() {
        try {
            // Check MongoDB connection before proceeding
            if (!await mongodbManager.isHealthy()) {
                console.warn('[EventScheduleUpdater] MongoDB not healthy, skipping update');
                return;
            }
            
            const guildId = client.guilds.cache.first()?.id;
            if (!guildId) return;
            const announcements = await mongodbManager.executeWithRetry(async () => {
                return await Announcement.find({ guildId });
            });
            const now = new Date();
            const upcomingEvents = [];
            for (const ann of announcements) {
                let nextRunDate = calculateNextRunDate(ann, now);
                // For custom intervals or unknown, just show as 'Unknown' but include in display
                if (!nextRunDate && (ann.interval === 'CUSTOM_DAYS' || ann.interval === 'CUSTOM_WEEKS')) {
                    nextRunDate = null;
                }
                upcomingEvents.push({ ...ann.toObject(), nextRunDate });
            }
            // Sort: known dates first, then unknowns
            upcomingEvents.sort((a, b) => {
                if (a.nextRunDate && b.nextRunDate) return a.nextRunDate - b.nextRunDate;
                if (a.nextRunDate) return -1;
                if (b.nextRunDate) return 1;
                return 0;
            });
            const eventChannelId = get('channels.eventSchedule');
            if (!eventChannelId) return;
            const guild = client.guilds.cache.get(guildId);
            if (!guild) return;
            const eventChannel = guild.channels.cache.get(eventChannelId);
            if (!eventChannel || !eventChannel.isTextBased()) return;
            const existingDisplay = await mongodbManager.executeWithRetry(async () => {
                return await DisplayMessage.findOne({ guildId });
            });
            let displayMessage = null;
            if (existingDisplay) {
                try {
                    displayMessage = await eventChannel.messages.fetch(existingDisplay.messageId);
                } catch (err) {
                    displayMessage = null;
                }
            }
            const eventEmbed = new EmbedBuilder()
                .setTitle('✨ Upcoming Alliance Events ✨')
                .setColor(0xFFD700)
                .setThumbnail('https://www.freeiconspng.com/uploads/calendar-icon-png-28.png')
                .setTimestamp()
                .setFooter({ text: 'This board is automatically updated.', iconURL: guild.iconURL() });
            if (upcomingEvents.length === 0) {
                eventEmbed.setDescription('There are no upcoming events scheduled right now. Check back later!');
            } else {
                eventEmbed.setDescription(`Here are our next scheduled events! Last Update: <t:${Math.floor(Date.now() / 1000)}:R>`);
                upcomingEvents.slice(0, 5).forEach((event, index) => {
                    let value = '';
                    if (event.nextRunDate) {
                        const eventTimestamp = Math.floor(event.nextRunDate.getTime() / 1000);
                        value += `\n**Starts:** <t:${eventTimestamp}:F> (<t:${eventTimestamp}:R>)\n\n`;
                    } else {
                        value += `\n**Starts:** Unknown (Custom Interval)\n\n`;
                    }
                    value += `**Channel:** <#${event.channelId}>\n\n`;
                    const contentPreview = event.content.substring(0, 1000) + (event.content.length > 1000 ? '...' : '');
                    value += `**Details:**\n>>> ${contentPreview}`;
                    eventEmbed.addFields({
                        name: `🗓️ ${getIntervalDisplayName(event)} Event #${index + 1}`,
                        value
                    });
                });
            }
            if (displayMessage) {
                await displayMessage.edit({ embeds: [eventEmbed] });
            } else {
                const sentMessage = await eventChannel.send({ embeds: [eventEmbed] });
                await mongodbManager.executeWithRetry(async () => {
                    await DisplayMessage.findOneAndUpdate(
                        { guildId },
                        { channelId: eventChannelId, messageId: sentMessage.id },
                        { upsert: true, new: true }
                    );
                });
            }
        } catch (err) {
            console.error('[EventScheduleUpdater] Failed to update event schedule embed:', err);
        }
    }

    // Run once on startup, then every 5 minutes (only if MongoDB is connected)
    if (mongoConnected) {
        updateEventScheduleEmbed();
        setInterval(updateEventScheduleEmbed, 5 * 60 * 1000);
    } else {
        console.log('[Startup] Event schedule updater delayed - MongoDB not connected');
    }
});
