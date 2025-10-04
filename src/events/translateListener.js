const { Events } = require('discord.js');
// Assuming 'fetch' is available globally in your Node.js environment (v18+) or handled by Discord.js's dependencies.

// --- Gemini API Configuration ---
// CRITICAL FIX: The API Key must be loaded from environment variables (e.g., in your .env file)
const API_KEY = process.env.GEMINI_API_KEY || ""; 
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;

// Unique, mostly invisible marker for the bot to identify its own translated messages
const TRANSLATION_MARKER = '\u200B**'; 

/**
 * Calls the Gemini API to detect the language and provide targeted translations.
 * Logic:
 * 1. If language is Korean -> Translate to English AND Korean (outputting the English result).
 * 2. If language is English -> Translate to Korean AND English (outputting the Korean result).
 * 3. If language is anything else -> Translate to English ONLY.
 * @param {string} text The message content to analyze and translate.
 * @returns {Promise<{isTranslationNeeded: boolean, originalLang: string, translations: {en: string, kr: string, isBidirectional: boolean}}>}
 */
async function getTranslation(text) {
    const systemPrompt = `You are a helpful translation bot for a gaming alliance. Your task is to analyze the user's message and provide translations based on the language detected.

    **Instructions for JSON output:**
    1. Detect the original language.
    2. If the language is Korean, translate it to English.
    3. If the language is English, translate it to Korean.
    4. If the language is neither English nor Korean, translate it only to English.
    
    **Respond STRICTLY in JSON format with the following schema:**
    {
      "originalLanguage": "Detected Language (e.g., Korean, English, Spanish)",
      "englishTranslation": "The English translation, or the original English text if no translation was required.",
      "koreanTranslation": "The Korean translation, or the original Korean text if no translation was required. Return null if translation to Korean is not needed/possible only if the original message was English or another language requiring only English translation."
    }`;

    const payload = {
        contents: [{ parts: [{ text: text }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    originalLanguage: { type: "STRING" },
                    englishTranslation: { type: "STRING" },
                    koreanTranslation: { type: "STRING", nullable: true } 
                },
                propertyOrdering: ["originalLanguage", "englishTranslation", "koreanTranslation"]
            }
        }
    };

    try {
        const maxRetries = 3;
        let lastError = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                // Using global fetch
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                // Check for API errors (like the 403 you saw)
                if (!response.ok) {
                    // *** ENHANCED LOGGING FOR API FAILURE ***
                    console.error(`[Translate Listener API ERROR] Attempt ${attempt + 1}: Status ${response.status}. Details:`, result);
                    throw new Error(`API Error ${response.status}: ${result.message || response.statusText}`);
                }


                if (result.candidates && result.candidates.length > 0 &&
                    result.candidates[0].content && result.candidates[0].content.parts &&
                    result.candidates[0].content.parts.length > 0) {
                    
                    const jsonText = result.candidates[0].content.parts[0].text;
                    const parsedJson = JSON.parse(jsonText);
                    
                    const originalLang = parsedJson.originalLanguage.toLowerCase().trim();
                    const isEnglish = originalLang.includes('english');
                    const isKorean = originalLang.includes('korean');

                    // FIX: Translation is needed if it's Korean (for EN) OR if it's English (for KR) OR any other language (for EN).
                    const isTranslationNeeded = (isKorean && parsedJson.englishTranslation) || (isEnglish && parsedJson.koreanTranslation) || (!isEnglish && !isKorean && parsedJson.englishTranslation); 
                    
                    const translations = {
                        en: parsedJson.englishTranslation,
                        kr: parsedJson.koreanTranslation,
                        isBidirectional: isEnglish || isKorean // True if EN or KR was the source
                    };
                    
                    return { 
                        isTranslationNeeded: isTranslationNeeded,
                        originalLang: parsedJson.originalLanguage, 
                        translations 
                    };

                } else {
                    lastError = new Error("Gemini API response structure invalid or empty.");
                    console.error("Gemini API Error: Invalid response structure", result);
                }
            } catch (error) {
                lastError = error;
                console.error(`Attempt ${attempt + 1} failed:`, error.message);
                if (attempt < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000)); // Exponential backoff
                }
            }
        }
        
        console.error(`Failed to get translation after ${maxRetries} attempts. Last error: ${lastError?.message}`);
        return { isTranslationNeeded: false, originalLang: 'Error', translations: { en: 'Error', kr: 'Error', isBidirectional: false } };

    } catch (error) {
        console.error("Fatal Translation Error:", error);
        return { isTranslationNeeded: false, originalLang: 'Error', translations: { en: 'Error', kr: 'Error', isBidirectional: false } };
    }
}


module.exports = {
    // *** CRITICAL FIX: Using string literal for robustness ***
    name: 'messageCreate', 
    once: false, 
    
    async execute(message, client) {
        
        // **CRITICAL DEBUG LOG: If you see this, the event listener is definitely running.**
        console.log(`[Translate Listener DEBUG] Event fired in #${message.channel.name} by ${message.author.tag}`);


        // 1. Ignore messages from bots (including self) and direct messages
        if (message.author.bot || !message.guild) {
             console.log('[Translate Listener DEBUG] Filtered: Bot message or DM.');
             return;
        }

        // 2. Ignore short messages that are likely greetings, emojis, or quick confirmations
        if (message.content.length < 1) {
            console.log(`[Translate Listener DEBUG] Filtered: Empty message.`);
            return;
        }

        // 3. Ignore slash commands.
        if (message.content.startsWith('/')) {
            console.log('[Translate Listener DEBUG] Filtered: Slash command.');
            return;
        }

        // 4. Ensure the message isn't already a translation reply to prevent loops
        // FIX: Check for the new invisible marker followed by bold formatting
        if (message.content.startsWith(TRANSLATION_MARKER)) {
            console.log('[Translate Listener DEBUG] Filtered: Already a translation (detected marker).');
            return;
        }
        
        // This log confirms we passed all filters and are proceeding to the API call.
        console.log(`[Translate Listener] Passed filters. Processing message from ${message.author.tag}.`);


        const { isTranslationNeeded, originalLang, translations } = await getTranslation(message.content);
        
        // **DEBUG LOG: Check if translation was deemed necessary**
        console.log(`[Translate Listener DEBUG] isTranslationNeeded: ${isTranslationNeeded}. Original Language: ${originalLang}`);


        if (isTranslationNeeded) {
            const { en, kr, isBidirectional } = translations;
            
            // Build the reply text with the new, cleaner marker
            let replyText = TRANSLATION_MARKER; // Start with the invisible marker and bold formatting
            
            const lowerLang = originalLang.toLowerCase();

            // Case 1: Bidirectional (EN <-> KR)
            if (isBidirectional) {
                if (lowerLang.includes('english') && kr) {
                    // Send Korean translation for English input
                    replyText += `Korean**: ${kr}`;
                } else if (lowerLang.includes('korean') && en) {
                    // Send English translation for Korean input
                    replyText += `English**: ${en}`;
                } else {
                    // Fallback for unexpected bidirectional case (e.g., model detects a mix)
                    replyText += `English**: ${en || 'Translation unavailable.'}`;
                }
            } 
            
            // Case 2: Other Language -> English only
            else {
                replyText += `English**:** ${en}`;
            }

            // *** ENHANCED FINAL GUARD AND LOGGING ***
            // 5. Check for valid response text (now > 10 chars) and ensure the translation isn't just repeating the input.
            if (replyText.toLowerCase().trim().length > 10 && !replyText.toLowerCase().includes(message.content.toLowerCase())) {
                
                console.log(`[Translate Listener DEBUG] Attempting to reply with text (Length: ${replyText.length}): ${replyText.substring(0, 50)}...`);

                await message.reply({ 
                    content: replyText.substring(0, 2000), // Ensure it stays under Discord limit
                    allowedMentions: { repliedUser: false }
                }).catch(console.error);

            } else {
                // **DEBUG LOG: Translation was calculated but skipped by the final filter**
                console.log(`[Translate Listener DEBUG] Skipped reply. Reason: Too short (<10 chars) or identical to original. Calculated Length: ${replyText.length}.`);
            }
        } else {
            // **DEBUG LOG: Translation was not needed (e.g., message was already in English and not being translated to Korean)**
            console.log(`[Translate Listener DEBUG] No translation needed based on model detection (${originalLang}).`);
        }
    },
};
