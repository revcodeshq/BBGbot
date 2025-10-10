const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Poll = require('../database/models.Poll');
const { parseDuration } = require('../utils/duration-parser.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a poll with buttons.')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('The question to ask in the poll.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option1')
                .setDescription('The first choice for the poll.')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('option2')
                .setDescription('The second choice for the poll.')
                .setRequired(true))
        .addStringOption(option => option.setName('option3').setDescription('An optional third choice.'))
        .addStringOption(option => option.setName('option4').setDescription('An optional fourth choice.'))
        .addStringOption(option => option.setName('option5').setDescription('An optional fifth choice.'))
        .addStringOption(option =>
            option.setName('duration')
                .setDescription('The duration of the poll (e.g., 1h, 2d). Leave blank for no time limit.')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: 64 });

        const question = interaction.options.getString('question');
        const durationStr = interaction.options.getString('duration');
        const options = [];
        for (let i = 1; i <= 5; i++) {
            const option = interaction.options.getString(`option${i}`);
            if (option) {
                options.push(option);
            }
        }

        let endTime = null;
        if (durationStr) {
            const durationMs = parseDuration(durationStr);
            if (!durationMs) {
                return interaction.editReply({ content: 'Invalid duration format. Use s, m, h, or d.' });
            }
            endTime = new Date(Date.now() + durationMs);
        }

        const pollEmbed = new EmbedBuilder()
            .setTitle(`📊 ${question}`)
            .setColor('#0099ff');

        if (endTime) {
            pollEmbed.setDescription(`Poll ends <t:${Math.floor(endTime.getTime() / 1000)}:R>`);
        }

        const optionFields = options.map((option, index) => {
            return { name: `${index + 1}. ${option}`, value: '0 votes (0%)', inline: false };
        });
        pollEmbed.addFields(optionFields);

        const buttons = options.map((option, index) => {
            return new ButtonBuilder()
                .setCustomId(`poll_${interaction.id}_${index}`)
                .setLabel(option)
                .setStyle(ButtonStyle.Primary);
        });

        const row = new ActionRowBuilder().addComponents(buttons);

        const pollMessage = await interaction.channel.send({ embeds: [pollEmbed], components: [row] });

        const poll = new Poll({
            guildId: interaction.guild.id,
            messageId: pollMessage.id,
            question,
            options,
            endTime,
        });

        await poll.save();

        await interaction.editReply({ content: 'Poll has been created successfully!' });
    },
};