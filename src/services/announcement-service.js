/**
 * Announcement Management Service
 * Handles CRUD operations for scheduled announcements
 */

const Announcement = require('../database/models.Announcements');
const { ValidationError, APIError } = require('../utils/error-handler');
const { metrics } = require('../utils/metrics');

class AnnouncementService {
    constructor() {
        this.intervals = {
            ONCE: 'One-time',
            DAILY: 'Daily',
            DAILY_2: 'Every 2 days',
            DAILY_3: 'Every 3 days',
            DAILY_4: 'Every 4 days',
            WEEKLY: 'Weekly',
            WEEKLY_2: 'Every 2 weeks',
            WEEKLY_3: 'Every 3 weeks',
            WEEKLY_4: 'Every 4 weeks'
        };
    }

    /**
     * Creates a new announcement
     * @param {Object} announcementData - Announcement data
     * @returns {Promise<Object>} Created announcement
     */
    async createAnnouncement(announcementData) {
        try {
            this.validateAnnouncementData(announcementData);
            
            const announcement = new Announcement(announcementData);
            const savedAnnouncement = await announcement.save();
            
            metrics.trackApiCall('DATABASE', 0, true);
            return savedAnnouncement;
            
        } catch (error) {
            metrics.trackApiCall('DATABASE', 0, false);
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new APIError('Failed to create announcement', 'DATABASE', error);
        }
    }

    /**
     * Gets all announcements for a guild
     * @param {string} guildId - Guild ID
     * @returns {Promise<Array>} Array of announcements
     */
    async getAnnouncements(guildId) {
        try {
            console.log(`[AnnouncementService] Querying database for guildId: ${guildId}`);
            const announcements = await Announcement.find({ guildId })
                .sort({ createdAt: -1 });
            
            console.log(`[AnnouncementService] Database query successful, found ${announcements.length} announcements`);
            metrics.trackApiCall('DATABASE', 0, true);
            return announcements;
            
        } catch (error) {
            console.error(`[AnnouncementService] Database query failed:`, error);
            metrics.trackApiCall('DATABASE', 0, false);
            throw new APIError('Failed to fetch announcements', 'DATABASE', error);
        }
    }

    /**
     * Gets a specific announcement by ID
     * @param {string} announcementId - Announcement ID
     * @returns {Promise<Object>} Announcement data
     */
    async getAnnouncementById(announcementId) {
        try {
            const announcement = await Announcement.findById(announcementId);
            
            if (!announcement) {
                throw new ValidationError('Announcement not found', 'announcementId');
            }
            
            metrics.trackApiCall('DATABASE', 0, true);
            return announcement;
            
        } catch (error) {
            metrics.trackApiCall('DATABASE', 0, false);
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new APIError('Failed to fetch announcement', 'DATABASE', error);
        }
    }

    /**
     * Updates an announcement
     * @param {string} announcementId - Announcement ID
     * @param {Object} updateData - Update data
     * @returns {Promise<Object>} Updated announcement
     */
    async updateAnnouncement(announcementId, updateData) {
        try {
            const announcement = await Announcement.findByIdAndUpdate(
                announcementId,
                updateData,
                { new: true, runValidators: true }
            );
            
            if (!announcement) {
                throw new ValidationError('Announcement not found', 'announcementId');
            }
            
            metrics.trackApiCall('DATABASE', 0, true);
            return announcement;
            
        } catch (error) {
            metrics.trackApiCall('DATABASE', 0, false);
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new APIError('Failed to update announcement', 'DATABASE', error);
        }
    }

    /**
     * Deletes an announcement
     * @param {string} announcementId - Announcement ID
     * @returns {Promise<boolean>} Success status
     */
    async deleteAnnouncement(announcementId) {
        try {
            const result = await Announcement.findByIdAndDelete(announcementId);
            
            if (!result) {
                throw new ValidationError('Announcement not found', 'announcementId');
            }
            
            metrics.trackApiCall('DATABASE', 0, true);
            return true;
            
        } catch (error) {
            metrics.trackApiCall('DATABASE', 0, false);
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new APIError('Failed to delete announcement', 'DATABASE', error);
        }
    }

    /**
     * Gets announcements with calculated next run times
     * @param {string} guildId - Guild ID
     * @returns {Promise<Array>} Announcements with metadata
     */
    async getAnnouncementsWithMetadata(guildId) {
        try {
            console.log(`[AnnouncementService] Fetching announcements for guild: ${guildId}`);
            const announcements = await this.getAnnouncements(guildId);
            console.log(`[AnnouncementService] Found ${announcements.length} announcements`);
            
            const now = new Date();
            
            return announcements.map(ann => {
                try {
                    const metadata = this.calculateNextRunTimeMetadata(ann, now);
                    // Handle both Mongoose documents and plain objects
                    const annObject = ann.toObject ? ann.toObject() : ann;
                    return {
                        ...annObject,
                        ...metadata
                    };
                } catch (mapError) {
                    console.error(`[AnnouncementService] Error processing announcement:`, mapError);
                    console.error(`[AnnouncementService] Announcement data:`, ann);
                    throw mapError;
                }
            });
            
        } catch (error) {
            console.error(`[AnnouncementService] Error in getAnnouncementsWithMetadata:`, error);
            throw new APIError('Failed to fetch announcements with metadata', 'DATABASE', error);
        }
    }

    /**
     * Calculates next run time metadata for an announcement
     * @param {Object} ann - Announcement object
     * @param {Date} now - Current time
     * @returns {Object} Metadata with sort key and next run string
     */
    calculateNextRunTimeMetadata(ann, now) {
        try {
            // Validate required properties
            if (!ann || !ann.time || !ann.interval) {
                console.error(`[AnnouncementService] Invalid announcement object:`, ann);
                return {
                    sortKey: 9999999999999,
                    nextRunString: 'Invalid data'
                };
            }
            
            const nextRunDate = this.calculateNextRunDate(ann, now);
            
            if (!nextRunDate) {
                return {
                    sortKey: 9999999999999, // Far future for sorting
                    nextRunString: 'Unable to calculate'
                };
            }
            
            const sortKey = nextRunDate.getTime();
            const nextRunString = nextRunDate.toISOString().replace('T', ' ').substring(0, 16) + ' UTC';
            
            return { sortKey, nextRunString };
        } catch (error) {
            console.error(`[AnnouncementService] Error calculating metadata:`, error);
            console.error(`[AnnouncementService] Announcement object:`, ann);
            return {
                sortKey: 9999999999999,
                nextRunString: 'Error calculating'
            };
        }
    }

    /**
     * Calculates the precise Date object for the next run time
     * @param {Object} ann - Announcement document
     * @param {Date} now - Current time in UTC
     * @returns {Date|null} Next run date or null if not calculable
     */
    calculateNextRunDate(ann, now) {
        try {
            if (!ann.time || typeof ann.time !== 'string') {
                console.error(`[AnnouncementService] Invalid time property:`, ann.time);
                return null;
            }
            
            const [targetHour, targetMinute] = ann.time.split(':').map(Number);
            
            if (isNaN(targetHour) || isNaN(targetMinute)) {
                console.error(`[AnnouncementService] Invalid time format:`, ann.time);
                return null;
            }
            
            // Use startDate if provided, otherwise use today
            let baseDate = new Date(now);
            if (ann.startDate) {
                // Parse startDate as UTC date since it's stored as YYYY-MM-DD
                const [year, month, day] = ann.startDate.split('-').map(Number);
                const startDate = new Date(Date.UTC(year, month - 1, day)); // Create UTC date at start of day
                // If startDate is in the past, use today as base
                baseDate = startDate > now ? startDate : new Date(now);
            }
            
            const nextRun = new Date(baseDate);
            nextRun.setUTCHours(targetHour, targetMinute, 0, 0);

            // If the calculated time is before now and we're using today's date, move to next occurrence
            if (nextRun < now && !ann.startDate) {
                // For recurring schedules, find next occurrence
                switch (ann.interval) {
                    case 'ONCE':
                        return null; // One-time in past, don't schedule
                    
                    case 'DAILY':
                        nextRun.setUTCDate(nextRun.getUTCDate() + 1);
                        break;
                        
                    case 'DAILY_2':
                        nextRun.setUTCDate(nextRun.getUTCDate() + 2);
                        break;
                        
                    case 'DAILY_3':
                        nextRun.setUTCDate(nextRun.getUTCDate() + 3);
                        break;
                        
                    case 'DAILY_4':
                        nextRun.setUTCDate(nextRun.getUTCDate() + 4);
                        break;
                        
                    case 'WEEKLY':
                        nextRun.setUTCDate(nextRun.getUTCDate() + 7);
                        break;
                        
                    case 'WEEKLY_2':
                        nextRun.setUTCDate(nextRun.getUTCDate() + 14);
                        break;
                        
                    case 'WEEKLY_3':
                        nextRun.setUTCDate(nextRun.getUTCDate() + 21);
                        break;
                        
                    case 'WEEKLY_4':
                        nextRun.setUTCDate(nextRun.getUTCDate() + 28);
                        break;
                        
                    default:
                        return null; // Unknown interval
                }
            }
            
            return nextRun;
        } catch (error) {
            console.error(`[AnnouncementService] Error calculating next run date:`, error);
            console.error(`[AnnouncementService] Announcement:`, ann);
            return null;
        }
    }

    /**
     * Validates announcement data
     * @param {Object} data - Announcement data to validate
     */
    validateAnnouncementData(data) {
        const required = ['guildId', 'channelId', 'time', 'interval', 'content'];
        
        for (const field of required) {
            if (!data[field]) {
                throw new ValidationError(`${field} is required`, field);
            }
        }
        
        // Validate time format
        if (!/^\d{2}:\d{2}$/.test(data.time)) {
            throw new ValidationError('Time must be in HH:MM format', 'time');
        }
        
        // Validate interval
        if (!this.intervals[data.interval]) {
            throw new ValidationError('Invalid interval', 'interval');
        }
        
        // Validate content length
        if (data.content.length > 1900) {
            throw new ValidationError('Content too long (max 1900 characters)', 'content');
        }
    }

    /**
     * Gets interval choices for Discord slash commands
     * @returns {Array} Array of choice objects
     */
    getIntervalChoices() {
        return Object.entries(this.intervals).map(([value, name]) => ({
            name,
            value
        }));
    }
}

module.exports = AnnouncementService;
