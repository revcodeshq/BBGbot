const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
    authorId: { type: String, required: true },
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    content: { type: String, required: true },
    time: { type: String, required: true },
    // FIX: Added 'ONCE' to the enum array to allow for one-time announcements.
    interval: { 
        type: String, 
        required: true, 
        enum: ['ONCE', 'DAILY', 'WEEKLY', 'CUSTOM_DAYS', 'CUSTOM_WEEKS'] 
    },
    // Set optional fields to default to null for consistency
    dayOfWeek: { type: Number, required: false, default: null }, // 0=Sun, 6=Sat
    daysInterval: { type: Number, required: false, default: null },
    weeksInterval: { type: Number, required: false, default: null },
    roleId: { type: String, required: false, default: null },
    // This will be set to the time it was last sent. For 'ONCE', the job processor should delete 
    // the document after sending it for the first time.
    lastSent: { type: Date, default: null } 
});

module.exports = mongoose.model('Announcement', announcementSchema);
