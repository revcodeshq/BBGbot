const { Events } = require('discord.js');
const { get } = require('../utils/config');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        // Assign role
        const roleId = get('roles.defaultRole');
        if (!roleId) {
            console.warn('DEFAULT_MEMBER_ROLE_ID not configured in environment variables');
            return;
        }

        const role = member.guild.roles.cache.get(roleId);
        if (role) {
            try {
                await member.roles.add(role);
                console.log(`Assigned role ${role.name} to ${member.user.tag}`);
            } catch (error) {
                console.error(`Failed to assign role to ${member.user.tag}:`, error);
            }
        } else {
            console.error(`Role with ID ${roleId} not found.`);
        }

        // Send welcome message
        const welcomeChannelId = get('channels.welcome');
        const announcementsChannelId = get('channels.announcements');
        const eventScheduleChannelId = get('channels.eventSchedule');
        const generalChannelId = get('channels.general');
        const serverTitle = get('welcomeMessage.title');
        const verifyChannelName = get('welcomeMessage.verifyChannelName');

        if (!welcomeChannelId) {
            console.warn('WELCOME_CHANNEL_ID not configured in environment variables');
            return;
        }

        // Build welcome message with dynamic content
        let welcomeMessageText = `Welcome, ${member}! We're glad to have you in **${serverTitle}**!

**Get Started:**
Please verify your account by going to the #${verifyChannelName} channel and clicking the button.

**Important Channels:**`;

        // Add channel references only if they are configured
        if (announcementsChannelId) {
            welcomeMessageText += `\n- <#${announcementsChannelId}>: Stay up to date with important news and announcements.`;
        }
        if (eventScheduleChannelId) {
            welcomeMessageText += `\n- <#${eventScheduleChannelId}>: Check out our upcoming events.`;
        }
        if (generalChannelId) {
            welcomeMessageText += `\n- <#${generalChannelId}>: General chat with the alliance.`;
        }

        welcomeMessageText += `

**Key Commands:**
- \`/help\`: Shows all available commands.
- \`/playerinfo\`: Check your or another member's game stats.
- \`/quote\`: Add or get a random quote from the alliance.`;

        try {
            const channel = await member.guild.channels.fetch(welcomeChannelId);
            if (channel && channel.isTextBased()) {
                await channel.send(welcomeMessageText);
                console.log(`Sent welcome message to ${member.user.tag} in channel ${channel.name}`);
            } else {
                console.error(`Welcome channel ${welcomeChannelId} not found or is not a text channel`);
            }
        } catch (error) {
            console.error('Error sending welcome message:', error);
        }
    },
};