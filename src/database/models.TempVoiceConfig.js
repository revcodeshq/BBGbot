const mongoose = require('mongoose');

const tempVoiceConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    creatorChannelId: { type: String, required: true },
    categoryId: { type: String, required: true },
    tempChannels: [{
        channelId: { type: String, required: true },
        ownerId: { type: String, required: true },
    }],
});

tempVoiceConfigSchema.index({ guildId: 1 });

module.exports = mongoose.model('TempVoiceConfig', tempVoiceConfigSchema);
