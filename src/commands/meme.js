const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const { brandingText } = require('../utils/branding.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('meme')
    .setDescription('Get a fun meme'),
  async execute(interaction) {
  // ...existing code...

    const getMeme = async () => {
      try {
        const response = await axios.get('https://meme-api.com/gimme');
        const { postLink, title, url, subreddit } = response.data;

        const embed = new EmbedBuilder()
          .setTitle(title)
          .setImage(url)
          .setColor('#0099ff')
          .setURL(postLink)
          .setFooter({ text: `From r/${subreddit} | ${brandingText}` });

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('next_meme')
              .setLabel('Next Meme')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setLabel('Original Post')
              .setStyle(ButtonStyle.Link)
              .setURL(postLink)
          );

        return { embeds: [embed], components: [row] };
      } catch (error) {
        console.error('Meme API error:', error);
        return { content: 'Could not fetch a meme at this time. Please try again later.', flags: 64 };
      }
    };

    const messagePayload = await getMeme();
    const message = await interaction.editReply(messagePayload);

    const collector = message.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async i => {
      if (i.customId === 'next_meme') {
        await i.deferUpdate();
        const newMessagePayload = await getMeme();
        await i.editReply(newMessagePayload);
      }
    });

    collector.on('end', collected => {
        // Remove the buttons after the collector expires
        const lastPayload = message.embeds[0];
        if(lastPayload){
            interaction.editReply({ embeds: [lastPayload], components: [] });
        }
    });
  }
};