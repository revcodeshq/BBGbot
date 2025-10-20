const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
    authorId: {
        type: String,
        required: true,
        index: true
    },
    guildId: {
        type: String,
        required: true,
        index: true
    },
    channelId: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true,
        maxlength: [2000, 'Content must be at most 2000 characters']
    },
    time: {
        type: String,
        required: true,
        validate: {
            validator: function(v) {
                return /^\d{2}:\d{2}$/.test(v);
            },
            message: 'Time must be in HH:MM format'
        }
    },
    interval: {
        type: String,
        required: true,
        enum: ['ONCE', 'DAILY', 'WEEKLY', 'CUSTOM_DAYS', 'CUSTOM_WEEKS']
    },
    dayOfWeek: {
        type: Number,
        required: false,
        default: null,
        min: [0, 'Day of week must be between 0-6'],
        max: [6, 'Day of week must be between 0-6']
    },
    daysInterval: {
        type: Number,
        required: false,
        default: null,
        min: [1, 'Days interval must be at least 1']
    },
    weeksInterval: {
        type: Number,
        required: false,
        default: null,
        min: [1, 'Weeks interval must be at least 1']
    },
    roleId: {
        type: String,
        required: false,
        default: null
    },
    lastSent: {
        type: Date,
        default: null,
        index: true
    }
}, {
    timestamps: true,
    collection: 'announcements'
});

// Compound index for efficient queries (find announcements by guild and time)
announcementSchema.index({ guildId: 1, time: 1 });

// Index for finding announcements that need to be sent
announcementSchema.index({ interval: 1, lastSent: 1 });

module.exports = mongoose.model('Announcement', announcementSchema);
