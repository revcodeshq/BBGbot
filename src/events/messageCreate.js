const { routeMessageToCommand } = require('../utils/intentDetector');
const Poll = require('../database/models.Poll');
const { parseDuration } = require('../utils/duration-parser.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { showAvatar } = require('../commands/avatar.js');
const { setTimer } = require('../commands/timer.js');
const { getPlayerInfo } = require('../commands/playerinfo.js');
const { createRally } = require('../commands/rally.js');
const { addQuote } = require('../commands/quote.js');
const { metrics } = require('../utils/metrics');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;
        
        // Track message metrics
        metrics.trackMessage();
        metrics.trackUser(message.author.id, message.guild.id);
        
        if (!message.mentions.has(client.user.id)) return;

        const content = message.content.replace(/<@!?\d+>/, '').trim();
        if (!content) return;

        try {
            const result = await routeMessageToCommand(content);
            if (!result || result.command === 'unknown') return;

            switch (result.command) {
                case 'poll':
                    if (result.options.question && result.options.choices && result.options.choices.length >= 2) {
                        const { question, choices, duration } = result.options;

                        let endTime = null;
                        if (duration) {
                            const durationMs = parseDuration(duration);
                            if (durationMs) {
                                endTime = new Date(Date.now() + durationMs);
                            }
                        }

                        const pollEmbed = new EmbedBuilder()
                            .setTitle(`📊 ${question}`)
                            .setColor('#0099ff');

                        if (endTime) {
                            pollEmbed.setDescription(`Poll ends <t:${Math.floor(endTime.getTime() / 1000)}:R>`);
                        }

                        const optionFields = choices.map((option, index) => {
                            return { name: `${index + 1}. ${option}`, value: '0 votes (0%)', inline: false };
                        });
                        pollEmbed.addFields(optionFields);

                        const buttons = choices.map((option, index) => {
                            return new ButtonBuilder()
                                .setCustomId(`poll_${message.id}_${index}`)
                                .setLabel(option)
                                .setStyle(ButtonStyle.Primary);
                        });

                        const row = new ActionRowBuilder().addComponents(buttons);

                        const pollMessage = await message.channel.send({ embeds: [pollEmbed], components: [row] });

                        const poll = new Poll({
                            guildId: message.guild.id,
                            messageId: pollMessage.id,
                            question,
                            options: choices,
                            endTime,
                        });

                        await poll.save();
                    } else {
                        message.reply("I understood you want a poll, but I couldn't find the question or at least two choices.");
                    }
                    break;
                case 'rally':
                    if (result.options.title) {
                        createRally(message.channel, message.member, result.options.title);
                    } else {
                        message.reply("I understood you want a rally, but I couldn't figure out the title.");
                    }
                    break;
                case 'playerinfo':
                    if (result.options.user) {
                        const userId = result.options.user.replace(/[<@!>]/g, '');
                        const user = await client.users.fetch(userId);
                        if (user) {
                            const embed = await getPlayerInfo(user);
                            message.channel.send({ embeds: [embed] });
                        } else {
                            message.reply("I couldn't find that user.");
                        }
                    }
                    break;
                case 'timer':
                    if (result.options.name && result.options.duration) {
                        const response = await setTimer(message.author, message.guild.id, message.channel.id, result.options.name, result.options.duration);
                        message.reply(response.message);
                    } else {
                        message.reply("I understood you want a timer, but I couldn't find the name or duration.");
                    }
                    break;
                case 'quote':
                    if (result.options.user) {
                        const userId = result.options.user.replace(/[<@!>]/g, '');
                        const quotedUser = await client.users.fetch(userId);
                        const messages = await message.channel.messages.fetch({ limit: 2 });
                        const messageToQuote = messages.last();
                        
                        if (quotedUser && messageToQuote) {
                            const embed = await addQuote(message.guild.id, message.author, quotedUser, messageToQuote.content);
                            message.channel.send({ embeds: [embed] });
                        } else {
                             message.reply("I couldn't find a user or a previous message to quote.");
                        }
                    }
                    break;
                case 'avatar': {
                    let targetUser;
                    if (result.options.user && result.options.user !== 'self') {
                        const userId = result.options.user.replace(/[<@!>]/g, '');
                        targetUser = await client.users.fetch(userId);
                    } else {
                        targetUser = message.author;
                    }
                    if (targetUser) {
                        showAvatar(message.channel, targetUser);
                    } else {
                        message.reply("I couldn't find that user.");
                    }
                    break;
                }
                default:
                    break;
            }
        } catch (error) {
            console.error("Error in AI command routing:", error);
            message.reply("Sorry, an error occurred while trying to understand your command.");
        }
    },
};