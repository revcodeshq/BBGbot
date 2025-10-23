/**
 * Timezone Conversion Service
 * Handles timezone conversion using Gemini API with caching and error handling
 */

const { get } = require('../utils/config');
const { apiCache } = require('../utils/cache');
const { APIError, ValidationError } = require('../utils/error-handler');
const { metrics } = require('../utils/metrics');

class TimezoneConversionService {
    constructor() {
        this.apiKey = get('api.geminiApiKey');
        this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent';
        this.systemPrompt = "You are a precise time and timezone conversion bot. Given a local time and timezone, your ONLY response must be the resulting time in 24-hour UTC format (HH:MM). Do not add any extra words, explanation, or punctuation. If conversion is impossible, respond with 'Error'.";
    }

    /**
     * Converts local time to UTC using Gemini API with caching
     * @param {string} localTime - Local time in HH:MM format
     * @param {string} timezone - Timezone identifier
     * @returns {Promise<string>} UTC time in HH:MM format
     */
    async convertToUTC(localTime, timezone) {
        try {
            // Validate inputs
            this.validateTimeFormat(localTime);
            this.validateTimezone(timezone);

            // Create cache key
            const cacheKey = `timezone_${localTime}_${timezone}`;
            
            // Try to get from cache first
            const cachedResult = await apiCache.get(cacheKey);
            if (cachedResult) {
                metrics.trackApiCall('GEMINI_API', 0, true, true); // Cache hit
                return cachedResult;
            }

            // Create conversion query
            const query = `Convert ${localTime} ${timezone} to 24-hour UTC format`;
            
            // Call Gemini API
            const result = await this.callGeminiAPI(query);
            
            // Validate and cache result
            const utcTime = this.validateUTCResult(result);
            await apiCache.set(cacheKey, utcTime, 3600); // Cache for 1 hour
            
            metrics.trackApiCall('GEMINI_API', Date.now(), true, false);
            return utcTime;

        } catch (error) {
            metrics.trackApiCall('GEMINI_API', Date.now(), false, false);
            if (error instanceof ValidationError || error instanceof APIError) {
                throw error;
            }
            throw new APIError(`Timezone conversion failed for ${localTime} ${timezone}`, 'GEMINI_API', error);
        }
    }

    /**
     * Validates time format (HH:MM)
     * @param {string} time - Time string to validate
     */
    validateTimeFormat(time) {
        if (!time || typeof time !== 'string') {
            throw new ValidationError('Time is required', 'time');
        }
        
        if (!/^\d{2}:\d{2}$/.test(time)) {
            throw new ValidationError('Time must be in HH:MM format', 'time');
        }
        
        const [hours, minutes] = time.split(':').map(Number);
        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            throw new ValidationError('Invalid time values', 'time');
        }
    }

    /**
     * Validates timezone identifier
     * @param {string} timezone - Timezone to validate
     */
    validateTimezone(timezone) {
        if (!timezone || typeof timezone !== 'string' || timezone.trim().length === 0) {
            throw new ValidationError('Timezone is required', 'timezone');
        }
    }

    /**
     * Validates UTC conversion result
     * @param {string} result - Result from Gemini API
     * @returns {string} Validated UTC time
     */
    validateUTCResult(result) {
        if (!result || typeof result !== 'string') {
            throw new APIError('Invalid response from timezone conversion API', 'GEMINI_API');
        }
        
        const trimmed = result.trim();
        if (trimmed === 'Error' || !/^\d{2}:\d{2}$/.test(trimmed)) {
            throw new APIError('Unable to convert timezone - invalid result', 'GEMINI_API');
        }
        
        return trimmed;
    }

    /**
     * Calls Gemini API with retry logic
     * @param {string} query - Conversion query
     * @returns {Promise<string>} API response
     */
    async callGeminiAPI(query) {
        if (!this.apiKey) {
            throw new APIError('Gemini API key not configured', 'GEMINI_API');
        }

        const payload = {
            contents: [{ parts: [{ text: query }] }],
            tools: [{ "google_search": {} }],
            systemInstruction: { parts: [{ text: this.systemPrompt }] },
        };

        const maxRetries = 3;
        let lastError;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch(`${this.apiUrl}?key=${this.apiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    throw new APIError(`API request failed: ${response.status}`, 'GEMINI_API');
                }

                const data = await response.json();
                
                if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                    throw new APIError('Invalid API response structure', 'GEMINI_API');
                }

                return data.candidates[0].content.parts[0].text;

            } catch (error) {
                lastError = error;
                
                if (attempt < maxRetries - 1) {
                    const delay = Math.pow(2, attempt) * 1000 + Math.floor(Math.random() * 1000);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw new APIError(`API call failed after ${maxRetries} attempts`, 'GEMINI_API', lastError);
    }
}

module.exports = TimezoneConversionService;
