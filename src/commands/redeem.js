const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const axios = require("axios");
const crypto = require("crypto");
const { brandingText } = require('../utils/branding.js');
const { get } = require('../utils/config');
// Import the logger utility
const logger = require('../utils/logger');

// --- Database Configuration ---
// Assuming your User model handles the database connection setup.
const User = require('../database/models.User');

// Configuration for the Whiteout Survival API
const API_BASE_URL = "https://wos-giftcode-api.centurygame.com/api";
const WEB_BASE_URL = "https://wos-giftcode.centurygame.com"; // Base URL for the CAPTCHA image/web interface

// --- 2CAPTCHA CONFIGURATION (User Must Fill) ---
// !!! IMPORTANT: REPLACE THIS PLACEHOLDER WITH YOUR ACTUAL 2CAPTCHA API KEY !!!
const TWO_CAPTCHA_API_KEY = "0f7d771d1badca4a914ecb51f5d024b1";
const TWO_CAPTCHA_IN_URL = "http://2captcha.com/in.php";
const TWO_CAPTCHA_RES_URL = "http://2captcha.com/res.php";
// --- END 2CAPTCHA CONFIGURATION ---

// --- Utility for adding a delay ---
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// --- SESSION MANAGEMENT: Custom Cookie Jar ---
const cookieJar = new Map();

// Create a single Axios instance for API interactions (Player, CAPTCHA, and Redemption)
const apiInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": WEB_BASE_URL, 
        "Referer": `${WEB_BASE_URL}/`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko=20100101 Firefox/143.0"
    },
    withCredentials: true 
});

// 1. Request Interceptor: Attach stored cookies to outgoing requests
apiInstance.interceptors.request.use(config => {
    if (cookieJar.size > 0) {
        const cookieString = Array.from(cookieJar.entries())
            .map(([name, value]) => `${name}=${value}`)
            .join("; ");
        
        config.headers["Cookie"] = cookieString;
    }
    return config;
}, error => {
    return Promise.reject(error);
});

// 2. Response Interceptor: Read and store new 'Set-Cookie' headers
apiInstance.interceptors.response.use(response => {
    const setCookieHeader = response.headers["set-cookie"] || response.headers["Set-Cookie"];
    if (setCookieHeader) {
        const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        
        cookies.forEach(cookie => {
            const [nameValuePair] = cookie.split(';');
            const [name, value] = nameValuePair.split('=').map(s => s.trim());
            if (name && value) {
                cookieJar.set(name, value);
            }
        });
    }
    return response;
}, error => {
    return Promise.reject(error);
});

// --- END OF SESSION MANAGEMENT SETUP ---

/**
 * Builds the signed form body with an MD5 signature.
 */
function buildSignedForm(params) {
  // Sort keys alphabetically
  const sortedKeys = Object.keys(params).sort();

  // Create query string: k1=v1&k2=v2... + SECRET
  const SECRET = get('api.wosApiSecret');
  const query = sortedKeys.map(k => `${k}=${params[k]}`).join("&") + SECRET;

  // Generate the MD5 signature
  const sign = crypto.createHash("md5").update(query).digest("hex");

  // Create the URLSearchParams body for the POST request
  const body = new URLSearchParams();
  for (const k of sortedKeys) {
    body.append(k, params[k]);
  }
  body.append("sign", sign);

  return body;
}

// --- ACTUAL DATABASE FUNCTION ---
/**
 * Fetches all verified users with a gameId (FID) from the Mongoose User collection.
 * @returns {Promise<Array<{fid: string, discordId: string, nickname: string}>>}
 */
async function getFIDsFromDB() {
    // Query for all users who have a gameId (FID) and are verified.
    const users = await User.find({ 
        gameId: { $ne: null },
        verified: true 
    }).select('gameId discordId nickname').lean();

    // Map the Mongoose results to the required format { fid: string, discordId: string, nickname: string }
    return users.map(u => ({ 
        fid: u.gameId,
        discordId: u.discordId,
        nickname: u.nickname || 'Unknown Player'
    }));
}
// --- END ACTUAL DATABASE FUNCTION ---

/**
 * Step 1: "Logs in" by checking the Player ID (FID).
 * This call is crucial for establishing the session cookie.
 */
async function checkPlayerId(fid, retryCount = 0) {
  const maxRetries = 3;
  const baseDelay = 2000; // 2 seconds base delay
  
  const params = {
    fid: String(fid),
    time: String(Date.now())
  };

  const body = buildSignedForm(params);

  try {
    const res = await apiInstance.post('/player', body.toString(), {
        headers: { "Accept": "application/json" }
    });

    if (res.data.code === 0 && res.data.data?.fid) {
        const nickname = res.data.data.nickname || 'Unknown';
        console.log(`Player Check Success. Nickname: ${nickname}`); // Explicit success log
        return { success: true, msg: `Player ID successfully verified. Nickname: ${nickname}`, nickname: nickname };
    }
        
    // Log the failing response to diagnose the RECEIVED. error source
    console.error(`Player Check Error for FID ${fid}: API Response:`, res.data);
    return { success: false, msg: res.data.msg || "Failed to verify player ID." };
  } catch (err) {
    const errorMessage = err.response?.data?.msg || err.message;
    const statusCode = err.response?.status;
    
    // Handle rate limiting (429) with retry
    if (statusCode === 429 && retryCount < maxRetries) {
      const retryDelay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
      console.log(`Rate limited for FID ${fid}. Retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})`);
      await delay(retryDelay);
      return checkPlayerId(fid, retryCount + 1);
    }
    
    console.error(`Player Check Error for FID ${fid} (Catch Block):`, err.response?.data || err.message);
    return { success: false, msg: `API Error: ${errorMessage}` };
  }
}

/**
 * Step 2: Fetches the CAPTCHA image data.
 * Requires a live session (established by checkPlayerId).
 */
async function getCaptchaImage(fid, retryCount = 0) {
  const maxRetries = 3;
  const baseDelay = 2000; // 2 seconds base delay
  
  const genParams = { 
    fid: String(fid),
    time: String(Date.now()) 
  };

  const genBody = buildSignedForm(genParams);

  try {
    const res = await apiInstance.post('/captcha', genBody.toString(), {
        headers: { 
            "Accept": "application/json" 
        }
    });

    if (res.data.code !== 0) {
      console.error("CAPTCHA Generation Error: API returned error code:", res.data);
      return null;
    }
        
    const dataUri = res.data.data?.img;
        
    if (dataUri && typeof dataUri === 'string' && dataUri.startsWith('data:')) {
        const parts = dataUri.split(',');
        // The base64 data is needed for 2Captcha
        const base64Data = parts[1];
        
        if (base64Data) {
            console.log(`CAPTCHA Image Retrieval successful for FID ${fid}.`);
            return { base64Data: base64Data };
        }
    } 
        
    console.error("CAPTCHA Generation Error: Successful response but no valid data URI found in 'data.img' field:", res.data);
    return null;
  } catch (err) {
    let errorMessage = err.message;
    const statusCode = err.response?.status;
    
    if (err.response?.data) {
        errorMessage = JSON.stringify(err.response.data); 
    } else if (statusCode) {
        errorMessage = `Request failed with status code ${statusCode}`;
    }
    
    // Handle rate limiting (429) with retry
    if (statusCode === 429 && retryCount < maxRetries) {
      const retryDelay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
      console.log(`Rate limited for CAPTCHA FID ${fid}. Retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})`);
      await delay(retryDelay);
      return getCaptchaImage(fid, retryCount + 1);
    }
    
    console.error(`CAPTCHA Generation Error for FID ${fid} (Catch Block):`, errorMessage);
    return null;
  }
}

// --- CAPTCHA SOLVING LOGIC (2Captcha) ---
/**
 * Solves the CAPTCHA using the 2Captcha API.
 */
async function solveCaptcha2Captcha(base64Data) {
    if (TWO_CAPTCHA_API_KEY === "YOUR_2CAPTCHA_API_KEY_HERE") {
        console.error("2Captcha API Key is not set. Cannot solve CAPTCHA.");
        return null;
    }
        
    // 1. Submit the CAPTCHA image (using base64 method)
    // We explicitly set min_len=4 and max_len=4 to ensure the result is the expected 4 characters.
    const uploadUrl = `${TWO_CAPTCHA_IN_URL}?key=${TWO_CAPTCHA_API_KEY}&method=base64&body=${encodeURIComponent(base64Data)}&min_len=4&max_len=4&json=1`;
        
    let response;
    try {
        response = await axios.get(uploadUrl);
    } catch (error) {
        console.error("2Captcha Upload Request failed:", error.message);
        return null;
    }

    if (response.data.status !== 1) {
        console.error("2Captcha Upload Failed:", response.data.request);
        return null;
    }

    const requestId = response.data.request;
    console.log(`2Captcha Request ID: ${requestId}. Polling for result...`);

    // 2. Poll for the result (max 10 polls, 5s delay each = max 50 seconds wait)
    for (let i = 0; i < 10; i++) {
        await delay(5000); // Increased delay from 3000ms to 5000ms
        const resultUrl = `${TWO_CAPTCHA_RES_URL}?key=${TWO_CAPTCHA_API_KEY}&action=get&id=${requestId}&json=1`;
        
        let resultResponse;
        try {
            resultResponse = await axios.get(resultUrl);
        } catch (error) {
            console.error("2Captcha Result Poll Failed:", error.message);
            continue; 
        }

        if (resultResponse.data.status === 1) {
            const solved = String(resultResponse.data.request).trim();
            console.log(`Captcha Solved by 2Captcha: ${solved}`);
            return solved; // Success
        } 
        
        if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
            console.error("2Captcha Error during polling:", resultResponse.data.request);
            return null; // Fatal error
        }
    }

    console.error("2Captcha Polling timed out.");
    return null;
}

/**
 * Step 3: Redeem gift code for a given FID, code, and solved captcha.
 */
async function redeemGiftCode(fid, code, captcha, retryCount = 0) {
  const maxRetries = 3;
  const baseDelay = 2000; // 2 seconds base delay
  
  const params = {
    fid: String(fid),
    cdk: String(code),
    captcha_code: String(captcha),
    time: String(Date.now())
  };

  const body = buildSignedForm(params);

  try {
    const res = await apiInstance.post('/gift_code', body.toString(), {
        headers: { "Accept": "application/json, text/plain, */*" }
    });

    console.log("API Response:", res.data);
    return res.data;
  } catch (err) {
    const statusCode = err.response?.status;
    
    // Handle rate limiting (429) with retry
    if (statusCode === 429 && retryCount < maxRetries) {
      const retryDelay = baseDelay * Math.pow(2, retryCount); // Exponential backoff
      console.log(`Rate limited for redemption FID ${fid}. Retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${maxRetries})`);
      await delay(retryDelay);
      return redeemGiftCode(fid, code, captcha, retryCount + 1);
    }
    
    console.error("API Error:", err.response?.data || err.message);
    return { code: -1, msg: err.response?.data?.msg || err.message || "An unknown error occurred during redemption." };
  }
}

/**
 * Formats the final results into a clean Discord embed.
 * @param {string} code - The gift code used.
 * @param {number} totalUsers - Total number of FIDs processed.
 * @param {Array<{msg: string, status: 'SUCCESS'|'SKIPPED'|'FAILED', fid: string, nickname: string, discordId: string}>} results - Array of individual redemption results.
 * @returns {EmbedBuilder} The configured Discord embed.
 */
function formatResults(code, totalUsers, results) {
    const success = results.filter(r => r.status === 'SUCCESS');
    const skipped = results.filter(r => r.status === 'SKIPPED');
    const failed = results.filter(r => r.status === 'FAILED');

    // Create Field Content
    // We limit the displayed lists to avoid hitting Discord's 1024 character limit per field.
    const MAX_DISPLAY_COUNT = 15;

    const formatList = (arr) => {
        let list = arr.slice(0, MAX_DISPLAY_COUNT)
            .map(r => `• **${r.nickname}** (\`${r.fid}\`)`)
            .join('\n');
        
        if (arr.length > MAX_DISPLAY_COUNT) {
            list += `\n*...and ${arr.length - MAX_DISPLAY_COUNT} more*`;
        }
        return list || '*(None)*';
    };

    const embed = new EmbedBuilder()
        .setTitle(`🎉 Batch Redemption Report: ${code}`)
        .setDescription(`Processed **${totalUsers}** verified FIDs.`)
        .setColor(failed.length > 0 ? 0xff0000 : (success.length > 0 ? 0x00ff00 : 0xffa500)) // Red, Green, or Orange color
        .setThumbnail('https://i.imgur.com/G5X6mP7.png') // Generic gift box icon for branding
        .addFields(
            {
                name: `✅ Successful Redemptions (${success.length})`,
                value: formatList(success),
                inline: true,
            },
            {
                name: `🟡 Already Redeemed (${skipped.length})`,
                value: formatList(skipped),
                inline: true,
            },
            {
                name: '\u200B', // Blank space field
                value: '\u200B',
                inline: false,
            }
        )
        .setTimestamp()
        .setFooter({ text: `Batch run initiated by ${results[0]?.initiatorTag || 'Bot'} | ${brandingText}` });

    // Add failures as a separate, full-width field if any exist
    if (failed.length > 0) {
        embed.addFields({
            name: `❌ Failures (${failed.length})`,
            value: failed.map(r => `• **${r.nickname}**: ${r.msg.replace('FAILED: ', '')}`).join('\n').substring(0, 1024),
            inline: false,
        });
    }

    return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("redeem_batch") // Renamed command for batch action
    .setDescription("Redeem a gift code for ALL registered FIDs (using MongoDB data)")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt =>
      opt.setName("code").setDescription("Gift code to redeem").setRequired(true)
    ),
 
  async execute(interaction) {
    const code = interaction.options.getString("code");
    const initiatorTag = interaction.user.tag;
        
    // Define the error code for "Already Redeemed" based on past API responses
    const ALREADY_REDEEMED_CODE = 40008; 

    // --- Batch Setup ---
    const redemptionResults = [];
    let initialReply = `Starting batch redemption for code **${code}**...`;

    await interaction.deferReply({ ephemeral: false }); // Making this reply visible for all
    await interaction.editReply(initialReply);

    // 1. Fetch all FIDs from the actual database
    let usersToRedeem;
    try {
        usersToRedeem = await getFIDsFromDB();
        initialReply += `\nFound **${usersToRedeem.length}** verified FIDs to process.`;
        await interaction.editReply(initialReply);
        
        if (usersToRedeem.length === 0) {
            await interaction.editReply({ content: `⚠️ Found 0 verified FIDs in the database. Redemption aborted.`, ephemeral: true });
            return;
        }
    } catch (e) {
        await interaction.editReply({ content: `❌ Database Error: Could not fetch FIDs. Please check your Mongoose connection and the path to your User model. Error: ${e.message}`, ephemeral: true });
        console.error("Database Fetch Error:", e);
        return;
    }

    // 2. Iterate and redeem sequentially
    for (const [index, user] of usersToRedeem.entries()) {
        const { fid, discordId, nickname } = user;
        const resultItem = { fid, discordId, nickname, initiatorTag };
        
        // Add delay between users to prevent rate limiting (except for first user)
        if (index > 0) {
            await delay(3000); // 3 second delay between users
        }
        
        // Update status for the current user
        await interaction.editReply(`${initialReply}\n\nProcessing user ${index + 1} of ${usersToRedeem.length} - **${nickname}** (\`${fid}\`)...`);

        // --- Phase 1 & 2: Auth, CAPTCHA Fetch, Solve ---
        const playerCheck = await checkPlayerId(fid);
        
        if (!playerCheck.success) {
            resultItem.status = 'FAILED';
            resultItem.msg = `Player Check Failed: ${playerCheck.msg}`;
            redemptionResults.push(resultItem);
            
            const logDetails = `Code: \`${code}\`\nUser: <@${discordId}>\nFID: \`${fid}\`\nReason: Player Check Failed - ${playerCheck.msg}`;
            await logger.logBotActivity("Gift Code Redemption Failure (Player Check)", logDetails, interaction).catch(err => console.error("Failed to log activity:", err));
            continue; 
        }

        // Small delay before CAPTCHA fetch
        await delay(1000);
        
        const captchaData = await getCaptchaImage(fid);
        if (!captchaData) {
            resultItem.status = 'FAILED';
            resultItem.msg = `CAPTCHA Fetch Failed.`;
            redemptionResults.push(resultItem);

            const logDetails = `Code: \`${code}\`\nUser: <@${discordId}>\nFID: \`${fid}\`\nNickname: **${playerCheck.nickname}**\nReason: CAPTCHA image could not be fetched.`;
            await logger.logBotActivity("Gift Code Redemption Failure (CAPTCHA Fetch)", logDetails, interaction).catch(err => console.error("Failed to log activity:", err));
            
            continue;
        }

        const solvedCaptcha = await solveCaptcha2Captcha(captchaData.base64Data);
        if (!solvedCaptcha) {
            resultItem.status = 'FAILED';
            resultItem.msg = `CAPTCHA Solve Failed or Timed Out.`;
            redemptionResults.push(resultItem);

            const logDetails = `Code: \`${code}\`\nUser: <@${discordId}>\nFID: \`${fid}\`\nNickname: **${playerCheck.nickname}**\nReason: CAPTCHA solving failed or timed out.`;
            await logger.logBotActivity("Gift Code Redemption Failure (CAPTCHA Solve)", logDetails, interaction).catch(err => console.error("Failed to log activity:", err));
            
            continue;
        }
        
        // Small delay before redemption
        await delay(1000);
        
        // --- Phase 3: Redemption Submission ---
        // Add delay before redeeming after solving CAPTCHA
        await delay(1500);

        let result = await redeemGiftCode(fid, code, solvedCaptcha);
        let captchaRetries = 0;
        // Retry CAPTCHA/redeem if CAPTCHA error (err_code: 40103)
        while (result && result.err_code === 40103 && captchaRetries < 2) {
            console.log(`CAPTCHA CHECK ERROR for FID ${fid}. Retrying CAPTCHA (${captchaRetries + 1}/2)`);
            await delay(2000);
            const newCaptchaData = await getCaptchaImage(fid);
            if (!newCaptchaData) break;
            const newSolvedCaptcha = await solveCaptcha2Captcha(newCaptchaData.base64Data);
            if (!newSolvedCaptcha) break;
            await delay(1500);
            result = await redeemGiftCode(fid, code, newSolvedCaptcha);
            captchaRetries++;
        }

        const finalNickname = playerCheck.nickname || user.nickname || 'Unknown';
        const resultReason = result.msg || JSON.stringify(result);

        let logAction;

        // CHECK FOR ALREADY REDEEMED CODE (err_code: 40008)
        if (result.err_code === ALREADY_REDEEMED_CODE) {
            resultItem.status = 'SKIPPED';
            resultItem.msg = 'Already Redeemed';
            logAction = "Gift Code Redemption Skipped (Already Redeemed)";
        } else if (result.code === 0) {
            resultItem.status = 'SUCCESS';
            resultItem.msg = `SUCCESS`;
            logAction = "Gift Code Redemption Success";
        } else if (result.err_code === 40103) {
            resultItem.status = 'FAILED';
            resultItem.msg = 'CAPTCHA CHECK ERROR after retries.';
            logAction = "Gift Code Redemption Failure (CAPTCHA)";
        } else {
            resultItem.status = 'FAILED';
            resultItem.msg = resultReason;
            logAction = "Gift Code Redemption Failure";
        }

        // --- LOGGING ---
        const logDetails = `Code: \`${code}\`\nUser: <@${discordId}>\nFID: \`${fid}\`\nNickname: **${finalNickname}**\nStatus: ${resultItem.status}\nAPI Response: ${resultReason}`;
        await logger.logBotActivity(logAction, logDetails, interaction).catch(err => {
            console.error("Failed to log activity:", err);
        });

        redemptionResults.push(resultItem);
    }
        
    // 3. Final Report (using Embed)
    const finalEmbed = formatResults(code, usersToRedeem.length, redemptionResults);
        
    // The final reply now sends the embed
    await interaction.editReply({ content: `Batch redemption finished! See the full report below.`, embeds: [finalEmbed] });
  }
};