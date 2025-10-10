const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Quote = require('../database/models.Quote');
const { brandingText } = require('../utils/branding.js');

async function addQuote(guildId, author, quotedUser, text) {
    try {
        await Quote.create({
            guildId: guildId,
            text: text,
            quotedUserId: quotedUser.id,
            authorId: author.id,
        });
        return new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Quote Saved!')
            .setDescription(`"${text}"`) // Corrected escaping for description
            .setAuthor({ name: `- ${quotedUser.tag}`, iconURL: quotedUser.displayAvatarURL() })
            .setFooter({ text: `Added by ${author.tag}` });
    } catch (error) {
        console.error("Error adding quote:", error);
        return new EmbedBuilder().setColor('#ff0000').setTitle('❌ Error').setDescription('An error occurred while saving the quote.');
    }
}

async function getRandomQuote(guildId, client) {
    try {
        const randomQuote = await Quote.aggregate([
            { $match: { guildId: guildId } },
            { $sample: { size: 1 } }
        ]);
        if (randomQuote.length === 0) {
            return { content: 'There are no quotes saved in this server yet. Use `/quote add` to save one!' };
        }
        const quote = randomQuote[0];
        const quotedUser = await client.users.fetch(quote.quotedUserId);
        const authorUser = await client.users.fetch(quote.authorId);
        return { embeds: [new EmbedBuilder()
            .setColor('#0099ff')
            .setDescription(`"${quote.text}"`) // Corrected escaping for description
            .setAuthor({ name: `- ${quotedUser.tag}`, iconURL: quotedUser.displayAvatarURL() })
            .setTimestamp(new Date(quote.createdAt))
            .setFooter({ text: `Added by ${authorUser.tag}` })] };
    } catch (error) {
        console.error("Error fetching random quote:", error);
        return { content: 'An error occurred while fetching a quote.' };
    }
}

async function listQuotes(guildId, user) {
    try {
        const userQuotes = await Quote.find({ guildId: guildId, quotedUserId: user.id }).sort({ createdAt: 'desc' });
        if (userQuotes.length === 0) {
            return { content: `${user.tag} doesn\'t have any quotes saved yet.` };
        }
        const description = userQuotes.map((quote, index) => {
            const date = new Date(quote.createdAt).toLocaleDateString();
            return `${index + 1}. "${quote.text}" - *${date}*`; // Corrected escaping for description
        }).join('\n\n');
        return { embeds: [new EmbedBuilder()
            .setColor('#0099ff')
            .setAuthor({ name: `Quotes by ${user.tag}`, iconURL: user.displayAvatarURL() })
            .setTimestamp()
            .setDescription(description.substring(0, 4096))
            .setFooter({ text: brandingText })] };
    } catch (error) {
        console.error("Error listing quotes:", error);
        return { content: 'An error occurred while fetching quotes.' };
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quote')
        .setDescription('Manage and enjoy memorable quotes from the alliance.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Save a new quote.')
                .addUserOption(option => option.setName('user').setDescription('The user who said the quote.').setRequired(true))
                .addStringOption(option => option.setName('text').setDescription('The text of the quote.').setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('random')
                .setDescription('Get a random quote.'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all quotes from a specific user.')
                .addUserOption(option => option.setName('user').setDescription('The user whose quotes you want to see.').setRequired(true))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add') {
            await interaction.deferReply({ flags: 64 });
            const quotedUser = interaction.options.getUser('user');
            const text = interaction.options.getString('text');
            const embed = await addQuote(interaction.guild.id, interaction.user, quotedUser, text);
            await interaction.channel.send({ embeds: [embed] });
            await interaction.editReply({ content: 'Quote saved!' });
        } else if (subcommand === 'random') {
            await interaction.deferReply();
            const result = await getRandomQuote(interaction.guild.id, interaction.client);
            await interaction.editReply(result);
        } else if (subcommand === 'list') {
            await interaction.deferReply({ flags: 64 });
            const user = interaction.options.getUser('user');
            const result = await listQuotes(interaction.guild.id, user);
            await interaction.editReply(result);
        }
    },
    addQuote,
    getRandomQuote,
    listQuotes,
};