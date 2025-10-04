const { Events } = require('discord.js');

module.exports = {
    name: Events.GuildMemberAdd,
    async execute(member) {
        // Assign role
        const roleId = '1421959206751440996';
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
        const welcomeChannelId = '1422944137224781866';
        const announcementsChannelId = '1421960221110308967';
        const eventScheduleChannelId = '1421961434832830526';
        const generalChannelId = '1421965122850525305';

        const welcomeMessage = `Welcome, ${member}! We're glad to have you in **BBG - BeersBaconGlory**!\n\n**Get Started:**\nPlease verify your account by going to the #✅-verify channel and clicking the button.\n\n**Important Channels:**\n- <#${announcementsChannelId}>: Stay up to date with important news and announcements.\n- <#${eventScheduleChannelId}>: Check out our upcoming events.\n- <#${generalChannelId}>: General chat with the alliance.\n\n**Key Commands:**\n- 
/help
: Shows all available commands.\n- 
/playerinfo
: Check your or another member's game stats.\n- 
/quote
: Add or get a random quote from the alliance.`;

        try {
            const channel = await member.guild.channels.fetch(welcomeChannelId);
            if (channel && channel.isTextBased()) {
                await channel.send(welcomeMessage);
            }
        } catch (error) {
            console.error('Error sending welcome message:', error);
        }
    },
};