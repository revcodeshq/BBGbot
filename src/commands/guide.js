const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { brandingText } = require('../utils/branding.js');
// Assuming node-fetch is available in your environment (Node 18+ or manually installed)
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));


// --- Gemini API Configuration ---
const API_KEY = process.env.GEMINI_API_KEY || ""; 
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;
const MODEL_NAME = 'gemini-2.5-flash-preview-05-20'; // Model optimized for quick, grounded Q&A

/**
 * Calls the Gemini API to provide a comprehensive answer using Google Search grounding.
 * @param {string} prompt The user's question about the game.
 * @returns {Promise<{text: string, sources: Array<{uri: string, title: string}>}>} The generated response and its sources.
 */
async function getGuideResponse(prompt) {
    if (!API_KEY) {
        throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }

    // --- UPDATED SYSTEM PROMPT FOR WHITEOUT SURVIVAL SPECIALIZATION ---
    const systemPrompt = `You are an expert guide for the game **Whiteout Survival** alliance. Your knowledge covers all aspects of the game: heroes, resources, strategy, and mechanics. 
    Provide a concise, easy-to-read answer to the user's question. Focus on clarity and accuracy, and **make sure your answer is specific to the Whiteout Survival game**. 
    Use the provided Google Search results to ground your answer and ensure the information is up-to-date.
    Format your response clearly using paragraphs or bullet points within a single text block.`;
    // --- END UPDATED SYSTEM PROMPT ---

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        // Enable Google Search for up-to-date, real-time information
        tools: [{ "google_search": {} }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        const candidate = result.candidates?.[0];

        if (candidate && candidate.content?.parts?.[0]?.text) {
            const text = candidate.content.parts[0].text;
            let sources = [];
            const groundingMetadata = candidate.groundingMetadata;

            if (groundingMetadata && groundingMetadata.groundingAttributions) {
                sources = groundingMetadata.groundingAttributions
                    .map(attribution => ({
                        uri: attribution.web?.uri,
                        title: attribution.web?.title,
                    }))
                    .filter(source => source.uri && source.title); // Filter out invalid sources
            }
            return { text, sources };
        } else {
            console.error("Gemini API Error: Invalid response structure or content missing.", result);
            throw new Error("The AI model did not return a valid response.");
        }

    } catch (error) {
        console.error("Guide API Fetch Error:", error);
        throw new Error(`An API error occurred: ${error.message}`);
    }
}


module.exports = {
    data: new SlashCommandBuilder()
        .setName('guide')
        .setDescription('Ask the bot any strategy or game-related question for a detailed answer.')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('The question you need an answer to (e.g., "Best way to farm diamonds?").')
                .setRequired(true)),

    async execute(interaction) {
        // Defer reply immediately since the API call can take a moment
        await interaction.deferReply();

        const question = interaction.options.getString('question');

        if (!API_KEY) {
             return interaction.editReply({ 
                content: "❌ API Key Error: The bot administrator must set the `GEMINI_API_KEY` in the environment file to enable the `/guide` command.", 
                ephemeral: true 
            });
        }
        
        try {
            const { text, sources } = await getGuideResponse(question);

            // 1. Build the Sources Footer
            let sourceField = '';
            if (sources.length > 0) {
                // Limit to the first 3 unique sources for brevity
                const uniqueSources = Array.from(new Set(sources.map(s => s.uri)))
                                           .slice(0, 3)
                                           .map(uri => sources.find(s => s.uri === uri));

                sourceField = uniqueSources.map((source, index) => 
                    `[${index + 1}](${source.uri})`
                ).join(' | ');
            }
            
            const guideEmbed = new EmbedBuilder()
                .setColor('#FEE75C') // Discord yellow for guides/info
                .setTitle(`📚 Whiteout Survival Guide: ${question.substring(0, 50)}${question.length > 50 ? '...' : ''}`)
                .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                .setDescription(text.substring(0, 4096)) // Ensure text is within Discord limit
                .setTimestamp()
                .setFooter({ 
                    text: (sourceField ? `Sources: ${sourceField}` : 'No external sources cited.') + ` | ${brandingText}`,
                    iconURL: 'https://i.imgur.com/L3r7Vf6.png' // A generic knowledge/book icon 
                });

            await interaction.editReply({ embeds: [guideEmbed] });

        } catch (error) {
            console.error("Guide command execution failed:", error);
            await interaction.editReply({ 
                content: `❌ Guide Error: I couldn't process that question. Reason: \`${error.message}\``,
                ephemeral: true 
            });
        }
    },
};
