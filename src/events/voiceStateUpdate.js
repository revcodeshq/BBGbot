const { Events, ChannelType, PermissionsBitField } = require('discord.js');
const TempVoiceConfig = require('../database/models.TempVoiceConfig');

module.exports = {
    name: Events.VoiceStateUpdate,
    async execute(oldState, newState) {
        const { guild } = newState;
        const config = await TempVoiceConfig.findOne({ guildId: guild.id });

        if (!config) {
            return;
        }

        // Channel Creation
        if (newState.channelId === config.creatorChannelId) {
            try {
                const tempChannel = await guild.channels.create({
                    name: `${newState.member.displayName}'s Channel`,
                    type: ChannelType.GuildVoice,
                    parent: config.categoryId,
                    permissionOverwrites: [
                        {
                            id: guild.roles.everyone,
                            deny: [PermissionsBitField.Flags.ViewChannel],
                        },
                        {
                            id: newState.member.id,
                            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ManageChannels],
                        },
                    ],
                });

                await newState.setChannel(tempChannel);

                config.tempChannels.push({ channelId: tempChannel.id, ownerId: newState.member.id });
                await config.save();
            } catch (error) {
                console.error('Error creating temporary voice channel:', error);
            }
        }

        // Channel Deletion
        if (oldState.channel && config.tempChannels.some(c => c.channelId === oldState.channelId)) {
            if (oldState.channel.members.size === 0) {
                try {
                    await oldState.channel.delete();
                    config.tempChannels = config.tempChannels.filter(c => c.channelId !== oldState.channelId);
                    await config.save();
                } catch (error) {
                    console.error('Error deleting temporary voice channel:', error);
                }
            }
        }
    },
};