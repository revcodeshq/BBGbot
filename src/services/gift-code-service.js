/**
 * Gift Code Redemption Service
 * Handles Whiteout Survival gift code redemption with enhanced architecture
 */

const axios = require('axios');
const crypto = require('crypto');
const { get } = require('../utils/config');
const { apiCache } = require('../utils/cache');
const PerformanceOptimizer = require('../utils/performance');
const RedemptionHistory = require('../database/models.RedemptionHistory');
const { APIError } = require('../utils/error-handler');

class GiftCodeRedemptionService {
    constructor() {
        this.secret = get('api.wosApiSecret');
        this.apiBaseUrl = 'https://wos-giftcode-api.centurygame.com/api';
        this.webBaseUrl = 'https://wos-giftcode-api.centurygame.com';
        this.cookieJar = new Map();
        this.setupAxiosInstance();
    }

    /**
     * Sets up Axios instance with interceptors for session management
     */
    setupAxiosInstance() {
        this.apiInstance = axios.create({
            baseURL: this.apiBaseUrl,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Origin': this.webBaseUrl,
                'Referer': `${this.webBaseUrl}/`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko=20100101 Firefox/143.0'
            },
            withCredentials: true
        });

        // Request interceptor: Attach cookies
        this.apiInstance.interceptors.request.use(config => {
            if (this.cookieJar.size > 0) {
                const cookieString = Array.from(this.cookieJar.entries())
                    .map(([name, value]) => `${name}=${value}`)
                    .join('; ');
                config.headers['Cookie'] = cookieString;
            }
            return config;
        });

        // Response interceptor: Store cookies
        this.apiInstance.interceptors.response.use(response => {
            const setCookieHeader = response.headers['set-cookie'] || response.headers['Set-Cookie'];
            if (setCookieHeader) {
                const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
                cookies.forEach(cookie => {
                    const [nameValuePair] = cookie.split(';');
                    const [name, value] = nameValuePair.split('=').map(s => s.trim());
                    if (name && value) {
                        this.cookieJar.set(name, value);
                    }
                });
            }
            return response;
        });
    }

    /**
     * Builds signed form body with MD5 signature
     * @param {Object} params - Parameters to sign
     * @returns {URLSearchParams} Signed form body
     */
    buildSignedForm(params) {
        const sortedKeys = Object.keys(params).sort();
        const query = sortedKeys.map(k => `${k}=${params[k]}`).join('&') + this.secret;
        const sign = crypto.createHash('md5').update(query).digest('hex');

        const body = new URLSearchParams();
        for (const k of sortedKeys) {
            body.append(k, params[k]);
        }
        body.append('sign', sign);
        return body;
    }

    /**
     * Validates gift code format
     * @param {string} code - Gift code to validate
     * @returns {boolean} True if valid
     */
    validateGiftCode(code) {
        if (!code || typeof code !== 'string') return false;
        const trimmed = code.trim();
        return trimmed.length >= 4 && trimmed.length <= 20 && /^[A-Za-z0-9]+$/.test(trimmed);
    }

    /**
     * Checks player ID with caching and enhanced error handling
     * @param {string} fid - Player FID
     * @returns {Promise<Object>} Player check result
     */
    async checkPlayerId(fid) {
        try {
            // Use cached player data if available
            const cachedPlayer = await apiCache.getPlayerData(fid, async () => {
                const params = {
                    fid: String(fid),
                    time: String(Date.now())
                };

                const body = this.buildSignedForm(params);
                const response = await this.apiInstance.post('/player', body.toString(), {
                    headers: { 'Accept': 'application/json' }
                });

                if (response.data.code === 0 && response.data.data?.fid) {
                    return {
                        success: true,
                        nickname: response.data.data.nickname || 'Unknown',
                        data: response.data.data
                    };
                }

                throw new APIError(response.data.msg || 'Failed to verify player ID', 'WOS_API');
            });

            return {
                success: true,
                msg: `Player ID successfully verified. Nickname: ${cachedPlayer.nickname}`,
                nickname: cachedPlayer.nickname
            };

        } catch (error) {
            if (error instanceof APIError) {
                throw error;
            }
            throw new APIError(`Player check failed for FID ${fid}`, 'WOS_API', error);
        }
    }

    /**
     * Fetches CAPTCHA image with enhanced error handling
     * @param {string} fid - Player FID
     * @returns {Promise<Object>} CAPTCHA data
     */
    async getCaptchaImage(fid) {
        // Try up to 3 times with delay for CAPTCHA generation
        let lastError = null;
        let lastApiResponse = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                // Refresh cookies/session per user
                this.cookieJar.clear && this.cookieJar.clear();

                const params = {
                    fid: String(fid),
                    time: String(Date.now())
                };

                const body = this.buildSignedForm(params);
                const response = await this.apiInstance.post('/captcha', body.toString(), {
                    headers: { 'Accept': 'application/json' }
                });

                lastApiResponse = response.data;
                if (response.data.code !== 0) {
                    console.error(`[CAPTCHA ERROR] FID ${fid} API response:`, response.data);
                    throw new APIError(`CAPTCHA generation failed: ${response.data.msg || response.data.code}`, 'WOS_API', response.data);
                }

                const dataUri = response.data.data?.img;
                if (!dataUri || !dataUri.startsWith('data:')) {
                    console.error(`[CAPTCHA ERROR] FID ${fid} Invalid dataUri:`, dataUri);
                    throw new APIError('Invalid CAPTCHA data received', 'WOS_API', dataUri);
                }

                const parts = dataUri.split(',');
                const base64Data = parts[1];
                
                if (!base64Data) {
                    console.error(`[CAPTCHA ERROR] FID ${fid} No base64Data`);
                    throw new APIError('No CAPTCHA image data found', 'WOS_API');
                }

                return { base64Data };
            } catch (error) {
                lastError = error;
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        // After retries, throw last error and log last API response
        console.error(`[CAPTCHA ERROR] FID ${fid} Final API response:`, lastApiResponse);
        throw new APIError(`CAPTCHA fetch failed for FID ${fid}: ${lastError?.message || 'Unknown error'}`, 'WOS_API', lastApiResponse || lastError);
    }

    /**
     * Solves CAPTCHA using CapMonster service
     * @param {string} base64Data - CAPTCHA image data
     * @returns {Promise<string>} Solved CAPTCHA text
     */
    async solveCaptcha(base64Data) {
        // Use CapMonster Cloud as primary
        const capMonsterApiKey = process.env.CAPMONSTER_API_KEY || this.capMonsterApiKey;
        if (!capMonsterApiKey) {
            throw new APIError('CapMonster API key not configured', 'CAPTCHA_SERVICE');
        }
        const { solveCaptchaCapMonster } = require('../utils/capmonster');
        try {
            const solved = await solveCaptchaCapMonster(base64Data, capMonsterApiKey);
            if (!solved || solved.length < 4) {
                throw new APIError('CapMonster returned empty or invalid result', 'CAPTCHA_SERVICE');
            }
            return solved.trim();
        } catch (error) {
            throw new APIError('CAPTCHA solving failed', 'CAPTCHA_SERVICE', error);
        }
    }

    /**
     * Redeems gift code for a player
     * @param {string} fid - Player FID
     * @param {string} code - Gift code
     * @param {string} captcha - Solved CAPTCHA
     * @returns {Promise<Object>} Redemption result
     */
    async redeemGiftCode(fid, code, captcha) {
        try {
            const params = {
                fid: String(fid),
                cdk: String(code),
                captcha_code: String(captcha),
                time: String(Date.now())
            };

            const body = this.buildSignedForm(params);
            const response = await this.apiInstance.post('/gift_code', body.toString(), {
                headers: { 'Accept': 'application/json, text/plain, */*' }
            });

            return response.data;

        } catch (error) {
            throw new APIError(`Gift code redemption failed for FID ${fid}`, 'WOS_API', error);
        }
    }

    /**
     * Processes a single user redemption with enhanced retry logic and rate limiting
     * @param {Object} user - User data
     * @param {string} code - Gift code
     * @returns {Promise<Object>} Redemption result
     */
    async processUserRedemption(user, code) {
        const { fid, discordId, nickname } = user;
        const resultItem = { fid, discordId, nickname };
        
        // Check DB for previous redemption
        const alreadyRedeemed = await RedemptionHistory.findOne({ fid, code });
        if (alreadyRedeemed) {
            resultItem.status = 'SKIPPED';
            resultItem.msg = 'Already Redeemed (DB)';
            return resultItem;
        }

        const maxRetries = 5;
        let attempt = 0;
        let lastError = null;
        let consecutiveCaptchaErrors = 0;
        
        while (attempt < maxRetries) {
            try {
                // Step 1: Check player (with rate limiting)
                const playerCheck = await this.checkPlayerId(fid);
                if (!playerCheck.success) {
                    resultItem.status = 'FAILED';
                    resultItem.msg = `Player Check Failed: ${playerCheck.msg}`;
                    return resultItem;
                }

                // Step 2: Get CAPTCHA with intelligent delays
                const captchaDelay = this.calculateCaptchaDelay(consecutiveCaptchaErrors, attempt);
                await new Promise(resolve => setTimeout(resolve, captchaDelay));
                
                let captchaData = null;
                let captchaGenError = null;
                for (let captchaAttempt = 1; captchaAttempt <= 3; captchaAttempt++) {
                    try {
                        captchaData = await this.getCaptchaImage(fid);
                        consecutiveCaptchaErrors = 0; // Reset on success
                        break;
                    } catch (err) {
                        captchaGenError = err;
                        consecutiveCaptchaErrors++;
                        console.error(`[CAPTCHA RETRY] FID ${fid} attempt ${captchaAttempt}:`, err.message);
                        
                        // If "NOT LOGIN", refresh session
                        if (err.message && err.message.includes('NOT LOGIN')) {
                            console.log(`[SESSION REFRESH] Refreshing session for FID ${fid}`);
                            this.cookieJar.clear();
                        }
                        
                        const retryDelay = this.calculateCaptchaRetryDelay(captchaAttempt, consecutiveCaptchaErrors);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    }
                }
                
                if (!captchaData) {
                    resultItem.status = 'FAILED';
                    resultItem.msg = `CAPTCHA generation failed: ${captchaGenError?.message || 'Unknown error'}`;
                    resultItem.apiError = captchaGenError?.apiResponse || captchaGenError?.stack || null;
                    return resultItem;
                }

                // Step 3: Solve CAPTCHA with enhanced retry logic
                let solvedCaptcha = null;
                let captchaSolveRetries = 0;
                let captchaSolveError = null;
                const maxCaptchaSolveRetries = 3;
                
                while (captchaSolveRetries < maxCaptchaSolveRetries && !solvedCaptcha) {
                    try {
                        solvedCaptcha = await this.solveCaptcha(captchaData.base64Data);
                        if (!solvedCaptcha || solvedCaptcha.length < 4) {
                            throw new APIError('Invalid CAPTCHA solution received', 'CAPTCHA_SERVICE');
                        }
                    } catch (err) {
                        captchaSolveError = err;
                        captchaSolveRetries++;
                        console.error(`[CAPTCHA SOLVE RETRY] FID ${fid} solve attempt ${captchaSolveRetries}:`, err.message);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                }
                
                if (!solvedCaptcha) {
                    resultItem.status = 'FAILED';
                    resultItem.msg = `CAPTCHA solving failed${captchaSolveError ? ': ' + captchaSolveError.message : ''}`;
                    resultItem.apiError = captchaSolveError?.apiResponse || captchaSolveError?.stack || null;
                    return resultItem;
                }

                // Step 4: Redeem code with delay
                await new Promise(resolve => setTimeout(resolve, 2000));
                const result = await this.redeemGiftCode(fid, code, solvedCaptcha);

                // Handle specific error codes with intelligent retry
                if (result && result.err_code === 40103) { // CAPTCHA CHECK ERROR
                    attempt++;
                    consecutiveCaptchaErrors++;
                    lastError = 'CAPTCHA CHECK ERROR';
                    console.log(`CAPTCHA check failed for FID ${fid}, retry ${attempt}/${maxRetries}`);
                    
                    // Longer delay for CAPTCHA errors
                    const retryDelay = this.calculateRetryDelay(attempt, 'captcha');
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }

                if (result && result.err_code === 40001) { // NOT LOGIN
                    attempt++;
                    lastError = 'NOT LOGIN';
                    console.log(`Auth failed for FID ${fid}, retry ${attempt}/${maxRetries}`);
                    
                    // Clear session and retry
                    this.cookieJar.clear();
                    const retryDelay = this.calculateRetryDelay(attempt, 'auth');
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    continue;
                }

                // Determine result status
                if (result.err_code === 40008) {
                    resultItem.status = 'SKIPPED';
                    resultItem.msg = 'Already Redeemed';
                } else if (result.code === 0) {
                    resultItem.status = 'SUCCESS';
                    resultItem.msg = 'SUCCESS';
                    // Record successful redemption in DB
                    await RedemptionHistory.create({ fid, code });
                } else {
                    resultItem.status = 'FAILED';
                    resultItem.msg = result.msg || JSON.stringify(result);
                    resultItem.apiError = result;
                }
                return resultItem;
                
            } catch (error) {
                lastError = error;
                attempt++;
                
                // Categorize error for better retry strategy
                const errorType = this.categorizeError(error);
                const retryDelay = this.calculateRetryDelay(attempt, errorType);
                
                console.error(`[REDEMPTION RETRY] FID ${fid} attempt ${attempt}/${maxRetries} (${errorType}):`, error.message);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
        
        // If all retries failed
        resultItem.status = 'FAILED';
        resultItem.msg = lastError?.message ? lastError.message : 'Unknown error occurred after full retries';
        resultItem.apiError = lastError?.apiResponse || lastError?.stack || null;
        return resultItem;
    }

    /**
     * Calculates delay for CAPTCHA generation based on error history
     * @param {number} consecutiveErrors - Number of consecutive CAPTCHA errors
     * @param {number} attempt - Current attempt number
     * @returns {number} Delay in milliseconds
     */
    calculateCaptchaDelay(consecutiveErrors, attempt) {
        const baseDelay = 1000; // Reduced from 2000ms
        const errorMultiplier = Math.min(consecutiveErrors + 1, 3); // Reduced from 5
        const attemptMultiplier = Math.min(attempt + 1, 2); // Reduced from 3
        return baseDelay * errorMultiplier * attemptMultiplier;
    }

    /**
     * Calculates retry delay for CAPTCHA generation attempts
     * @param {number} captchaAttempt - Current CAPTCHA attempt
     * @param {number} consecutiveErrors - Number of consecutive errors
     * @returns {number} Delay in milliseconds
     */
    calculateCaptchaRetryDelay(captchaAttempt, consecutiveErrors) {
        const baseDelay = 3000;
        const attemptMultiplier = Math.pow(2, captchaAttempt - 1);
        const errorMultiplier = Math.min(consecutiveErrors, 3);
        return baseDelay * attemptMultiplier * errorMultiplier;
    }

    /**
     * Calculates retry delay based on error type and attempt
     * @param {number} attempt - Current attempt number
     * @param {string} errorType - Type of error ('captcha', 'auth', 'network', 'other')
     * @returns {number} Delay in milliseconds
     */
    calculateRetryDelay(attempt, errorType) {
        const baseDelays = {
            'captcha': 4000,  // Reduced from 8000ms
            'auth': 3000,     // Reduced from 5000ms
            'network': 2000,  // Reduced from 3000ms
            'other': 2500     // Reduced from 4000ms
        };
        
        const baseDelay = baseDelays[errorType] || baseDelays.other;
        const attemptMultiplier = Math.pow(1.5, attempt - 1); // Exponential backoff
        return Math.min(baseDelay * attemptMultiplier, 30000); // Cap at 30 seconds
    }

    /**
     * Categorizes error for better retry strategy
     * @param {Error} error - The error to categorize
     * @returns {string} Error category
     */
    categorizeError(error) {
        const message = error.message?.toLowerCase() || '';
        
        if (message.includes('captcha') || message.includes('40103')) {
            return 'captcha';
        }
        if (message.includes('login') || message.includes('auth') || message.includes('40001')) {
            return 'auth';
        }
        if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
            return 'network';
        }
        return 'other';
    }

    /**
     * Processes batch redemption with performance optimization
     * @param {Array} users - Array of users to process
     * @param {string} code - Gift code
     * @returns {Promise<Array>} Array of redemption results
     */
    async processBatchRedemption(users, code, progressCallback) {
        // Use performance optimization for batch processing
        let processed = 0;
        const results = await PerformanceOptimizer.processBatches(
            users,
            async (user) => {
                // Reduced delay between users while maintaining stability
                await new Promise(resolve => setTimeout(resolve, 2000)); // Reduced from 5000ms
                const result = await this.processUserRedemption(user, code);
                processed++;
                if (progressCallback) {
                    await progressCallback(processed, users.length, result);
                }
                return result;
            },
            2, // Process two users at a time
            2  // Allow 2 concurrent API calls
        );

        // Final progress update
        if (progressCallback) await progressCallback(users.length, users.length);

        return results.map(result => result.success ? result.result : result);
    }
}

module.exports = GiftCodeRedemptionService;
