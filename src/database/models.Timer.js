const mongoose = require('mongoose');

const timerSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    endTime: { type: Date, required: true },
    timerName: { type: String, required: true },
    isDM: { type: Boolean, default: true },
});

// Indexing endTime for efficient querying of expired timers
timerSchema.index({ endTime: 1 });

module.exports = mongoose.model('Timer', timerSchema);
