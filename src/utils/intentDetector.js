const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

const API_KEY = process.env.GEMINI_API_KEY;
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${API_KEY}`;

/**
 * Analyzes a message to route it to a command and extract its options.
 * @param {string} messageContent The text of the user's message to the bot.
 * @returns {Promise<{command: string, options: object}|null>} An object with the detected command and its options, or null.
 */
async function routeMessageToCommand(messageContent) {
    if (!API_KEY) {
        console.warn("GEMINI_API_KEY is not set. Skipping AI routing.");
        return null;
    }

    const systemPrompt = `You are the command router for a Discord bot. Your job is to analyze a user's message and determine which command they are trying to use. You must also extract the necessary parameters for that command.
The output MUST be a single JSON object with two fields: "command" and "options".
- The "command" field must be one of the following strings: "poll", "rally", "playerinfo", "timer", "quote", "avatar", or "unknown".
- The "options" field must be a JSON object containing the extracted parameters for that command.

Here are the commands and their required options:
- poll: Requires a "question" and at least two "choices" (as an array of strings).
- rally: Requires a "title" (string).
- playerinfo: Requires a "user" (as a user mention like "<@12345>").
- timer: Requires a "name" (string) and a "duration" (string).
- quote: Requires a "user" (as a user mention like "<@12345>") and the "text" (string) to be quoted. The text is usually the message immediately preceding the command.
- avatar: Requires a "user" (as a user mention like "<@12345>", or the string "self" if they ask for their own).

If the user's intent is unclear or doesn't match any command, return {"command": "unknown", "options": {}}.

Example 1:
User Message: "create a poll: who is best, gina or jessie?"
Output: {"command": "poll", "options": {"question": "who is best", "choices": ["gina", "jessie"]}}

Example 2:
User Message: "start a rally for the foundry"
Output: {"command": "rally", "options": {"title": "foundry"}}

Example 3:
User Message: "show me <@123456789123456789>'s player info"
Output: {"command": "playerinfo", "options": {"user": "<@123456789123456789>"}}

Example 4:
User Message: "remind me to scout in 15 minutes"
Output: {"command": "timer", "options": {"name": "scout", "duration": "15 minutes"}}

Example 5:
User Message: "what's my avatar"
Output: {"command": "avatar", "options": {"user": "self"}}`;

    const payload = {
        contents: [{
            parts: [{ text: `User Message: "${messageContent}"
Output:` }]
        }],
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.0
        }
    };

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error("Gemini API Error (Router):", response.status, await response.text());
            return null;
        }

        const result = await response.json();
        const candidate = result.candidates?.[0];
        const jsonText = candidate?.content?.parts?.[0]?.text;

        if (jsonText) {
            return JSON.parse(jsonText);
        }
        return null;

    } catch (error) {
        console.error("AI Router Fetch Error:", error);
        return null;
    }
}

module.exports = { routeMessageToCommand };