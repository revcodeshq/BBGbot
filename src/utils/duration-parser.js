/**
 * Parses a duration string into milliseconds
 * @param {string} durationStr - Duration string (e.g., "5m", "2h", "1d", "30s")
 * @returns {number|null} Duration in milliseconds, or null if invalid format
 * @example
 * parseDuration("5m") // Returns 300000 (5 minutes in ms)
 * parseDuration("2h") // Returns 7200000 (2 hours in ms)
 * parseDuration("1d") // Returns 86400000 (1 day in ms)
 */
function parseDuration(durationStr) {
    const durationRegex = /(\d+)(s|m|h|d)/;
    const match = durationStr.match(durationRegex);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
        case 's':
            return value * 1000;
        case 'm':
            return value * 60 * 1000;
        case 'h':
            return value * 60 * 60 * 1000;
        case 'd':
            return value * 24 * 60 * 60 * 1000;
        default:
            return null;
    }
}

module.exports = { parseDuration };
