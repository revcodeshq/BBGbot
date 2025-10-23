const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { brandingText } = require('../utils/branding.js');
// Assuming node-fetch is available in your environment (Node 18+ or manually installed)
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));


// --- Gemini API Configuration ---
const API_KEY = process.env.GEMINI_API_KEY || ""; 
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${API_KEY}`;
const MODEL_NAME = 'gemini-2.5-pro'; // Model optimized for quick, grounded Q&A

/**
 * Calls the Gemini API to provide a comprehensive answer using Google Search grounding.
 * @param {string} prompt The user's question about the game.
 * @returns {Promise<{text: string, sources: Array<{uri: string, title: string}>}>} The generated response and its sources.
 */
async function getGuideResponse(prompt) {
    if (!API_KEY) {
        throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }

    // --- ENHANCED SYSTEM PROMPT FOR WHITEOUT SURVIVAL ---
    const systemPrompt = `You are an expert guide for **Whiteout Survival**, a mobile survival strategy game. Your knowledge covers all aspects of the game: base building, resource management, alliance warfare, heroes, and game mechanics.

**IMPORTANT GAME FACTS:**
- Whiteout Survival is a survival strategy game, NOT a hero collection game
- Focus on base building, resource management, and alliance warfare
- Heroes are obtained through recruitment and have different rarities
- The game has daily tasks, events, and alliance vs alliance combat

**RESPONSE GUIDELINES:**
- Provide detailed, comprehensive answers about Whiteout Survival
- Focus on survival strategies, base building, resource management, and alliance gameplay
- Give specific, actionable advice with step-by-step guidance
- Include multiple strategies and approaches when relevant
- Use bullet points and clear formatting for easy reading
- Use the provided Google Search results to ground your answer and ensure accuracy
- If you're unsure about specific game mechanics, say so rather than guessing

**DO NOT** mention game mechanics that don't exist in Whiteout Survival.

Answer the user's question with comprehensive, detailed guidance about Whiteout Survival.`;

    const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        // Enable Google Search for up-to-date, real-time information
        tools: [{ "google_search": {} }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            temperature: 0.7, // Balanced creativity and accuracy
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 15000, // Much longer responses
        }
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
                .setColor('#00D4FF') // Bright blue for guides/info
                .setTitle(`🎮 Whiteout Survival Guide`)
                .setAuthor({ 
                    name: `${interaction.user.displayName}'s Question`, 
                    iconURL: interaction.user.displayAvatarURL() 
                })
                .addFields([
                    { 
                        name: '❓ Question', 
                        value: question.length > 1000 ? question.substring(0, 997) + '...' : question, 
                        inline: false 
                    },
                    { 
                        name: '💡 Answer', 
                        value: text.length > 1000 ? text.substring(0, 997) + '...' : text, 
                        inline: false 
                    }
                ])
                .setTimestamp()
                .setFooter({ 
                    text: (sourceField ? `📚 Sources: ${sourceField}` : '📚 No external sources cited.') + ` • ${brandingText}`,
                    iconURL: 'https://i.imgur.com/L3r7Vf6.png'
                });

            await interaction.editReply({ embeds: [guideEmbed] });

        } catch (error) {
            console.error("Guide command execution failed:", error);
            
            // Better error handling with more helpful messages
            let errorMessage = "❌ **Guide Error**";
            if (error.message.includes("API error")) {
                errorMessage += "\n\n🚫 **API Error**: The AI service is temporarily unavailable. Please try again in a few moments.";
            } else if (error.message.includes("GEMINI_API_KEY")) {
                errorMessage += "\n\n🔑 **Configuration Error**: The bot administrator needs to set up the API key.";
            } else {
                errorMessage += `\n\n⚠️ **Error**: ${error.message}`;
            }
            
            await interaction.editReply({ 
                content: errorMessage,
                ephemeral: true 
            });
        }
    },
};