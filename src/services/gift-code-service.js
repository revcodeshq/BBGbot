/**
 * Gift Code Redemption Service
 * Handles Whiteout Survival gift code redemption with enhanced architecture
 */

const axios = require('axios');
const crypto = require('crypto');
const { get } = require('../utils/config');
const { apiCache } = require('../utils/cache');
const PerformanceOptimizer = require('../utils/performance');
const { APIError, ValidationError } = require('../utils/error-handler');
const { metrics } = require('../utils/metrics');

class GiftCodeRedemptionService {
    constructor() {
        this.secret = get('api.wosApiSecret');
        this.apiBaseUrl = 'https://wos-giftcode-api.centurygame.com/api';
        this.webBaseUrl = 'https://wos-giftcode-api.centurygame.com';
        this.twoCaptchaApiKey = get('api.twoCaptchaApiKey');
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
        try {
            const params = {
                fid: String(fid),
                time: String(Date.now())
            };

            const body = this.buildSignedForm(params);
            const response = await this.apiInstance.post('/captcha', body.toString(), {
                headers: { 'Accept': 'application/json' }
            });

            if (response.data.code !== 0) {
                throw new APIError('CAPTCHA generation failed', 'WOS_API');
            }

            const dataUri = response.data.data?.img;
            if (!dataUri || !dataUri.startsWith('data:')) {
                throw new APIError('Invalid CAPTCHA data received', 'WOS_API');
            }

            const parts = dataUri.split(',');
            const base64Data = parts[1];
            
            if (!base64Data) {
                throw new APIError('No CAPTCHA image data found', 'WOS_API');
            }

            return { base64Data };

        } catch (error) {
            if (error instanceof APIError) {
                throw error;
            }
            throw new APIError(`CAPTCHA fetch failed for FID ${fid}`, 'WOS_API', error);
        }
    }

    /**
     * Solves CAPTCHA using 2Captcha service
     * @param {string} base64Data - CAPTCHA image data
     * @returns {Promise<string>} Solved CAPTCHA text
     */
    async solveCaptcha(base64Data) {
        if (!this.twoCaptchaApiKey || this.twoCaptchaApiKey === 'YOUR_2CAPTCHA_API_KEY_HERE') {
            throw new APIError('2Captcha API key not configured', 'CAPTCHA_SERVICE');
        }

        try {
            // Submit CAPTCHA
            const uploadUrl = `http://2captcha.com/in.php?key=${this.twoCaptchaApiKey}&method=base64&body=${encodeURIComponent(base64Data)}&min_len=4&max_len=4&json=1`;
            
            const uploadResponse = await axios.get(uploadUrl);
            if (uploadResponse.data.status !== 1) {
                throw new APIError(`2Captcha upload failed: ${uploadResponse.data.request}`, 'CAPTCHA_SERVICE');
            }

            const requestId = uploadResponse.data.request;
            console.log(`2Captcha Request ID: ${requestId}. Polling for result...`);

            // Poll for result
            for (let i = 0; i < 10; i++) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const resultUrl = `http://2captcha.com/res.php?key=${this.twoCaptchaApiKey}&action=get&id=${requestId}&json=1`;
                const resultResponse = await axios.get(resultUrl);

                if (resultResponse.data.status === 1) {
                    const solved = String(resultResponse.data.request).trim();
                    console.log(`CAPTCHA solved: ${solved}`);
                    return solved;
                }

                if (resultResponse.data.request !== 'CAPCHA_NOT_READY') {
                    throw new APIError(`2Captcha error: ${resultResponse.data.request}`, 'CAPTCHA_SERVICE');
                }
            }

            throw new APIError('2Captcha polling timed out', 'CAPTCHA_SERVICE');

        } catch (error) {
            if (error instanceof APIError) {
                throw error;
            }
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
     * Processes a single user redemption with retry logic
     * @param {Object} user - User data
     * @param {string} code - Gift code
     * @returns {Promise<Object>} Redemption result
     */
    async processUserRedemption(user, code) {
        const { fid, discordId, nickname } = user;
        const resultItem = { fid, discordId, nickname };

        try {
            // Step 1: Check player
            const playerCheck = await this.checkPlayerId(fid);
            if (!playerCheck.success) {
                resultItem.status = 'FAILED';
                resultItem.msg = `Player Check Failed: ${playerCheck.msg}`;
                return resultItem;
            }

            // Step 2: Get CAPTCHA
            await new Promise(resolve => setTimeout(resolve, 1000));
            const captchaData = await this.getCaptchaImage(fid);
            
            // Step 3: Solve CAPTCHA
            const solvedCaptcha = await this.solveCaptcha(captchaData.base64Data);
            
            // Step 4: Redeem code
            await new Promise(resolve => setTimeout(resolve, 1500));
            let result = await this.redeemGiftCode(fid, code, solvedCaptcha);

            // Handle CAPTCHA retry if needed
            let captchaRetries = 0;
            while (result && result.err_code === 40103 && captchaRetries < 2) {
                console.log(`CAPTCHA retry ${captchaRetries + 1}/2 for FID ${fid}`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                const newCaptchaData = await this.getCaptchaImage(fid);
                const newSolvedCaptcha = await this.solveCaptcha(newCaptchaData.base64Data);
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                result = await this.redeemGiftCode(fid, code, newSolvedCaptcha);
                captchaRetries++;
            }

            // Determine result status
            if (result.err_code === 40008) {
                resultItem.status = 'SKIPPED';
                resultItem.msg = 'Already Redeemed';
            } else if (result.code === 0) {
                resultItem.status = 'SUCCESS';
                resultItem.msg = 'SUCCESS';
            } else if (result.err_code === 40103) {
                resultItem.status = 'FAILED';
                resultItem.msg = 'CAPTCHA CHECK ERROR after retries';
            } else {
                resultItem.status = 'FAILED';
                resultItem.msg = result.msg || JSON.stringify(result);
            }

            return resultItem;

        } catch (error) {
            resultItem.status = 'FAILED';
            resultItem.msg = error.message || 'Unknown error occurred';
            return resultItem;
        }
    }

    /**
     * Processes batch redemption with performance optimization
     * @param {Array} users - Array of users to process
     * @param {string} code - Gift code
     * @returns {Promise<Array>} Array of redemption results
     */
    async processBatchRedemption(users, code) {
        // Use performance optimization for batch processing
        const results = await PerformanceOptimizer.processBatches(
            users,
            async (user) => {
                // Add delay between users to prevent rate limiting
                await new Promise(resolve => setTimeout(resolve, 3000));
                return await this.processUserRedemption(user, code);
            },
            1, // Process one at a time to avoid rate limits
            1  // No concurrency for API calls
        );

        return results.map(result => result.success ? result.result : result);
    }
}

module.exports = GiftCodeRedemptionService;
