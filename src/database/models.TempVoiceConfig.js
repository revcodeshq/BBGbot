const mongoose = require('mongoose');

const tempVoiceConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    creatorChannelId: { type: String, required: true },
    categoryId: { type: String, required: true },
    tempChannels: [{
        channelId: { type: String, required: true },
        ownerId: { type: String, required: true },
    }],
    createdAt: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now }
});

// Indexes for temp voice queries
tempVoiceConfigSchema.index({ guildId: 1 }); // Guild-specific config
tempVoiceConfigSchema.index({ creatorChannelId: 1 }); // Channel-based lookups
tempVoiceConfigSchema.index({ 'tempChannels.channelId': 1 }); // Temp channel lookups
tempVoiceConfigSchema.index({ 'tempChannels.ownerId': 1 }); // Owner-based lookups

module.exports = mongoose.model('TempVoiceConfig', tempVoiceConfigSchema);
