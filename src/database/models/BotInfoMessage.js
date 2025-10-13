const mongoose = require('mongoose');


const botInfoMessageSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
});

// Ensure only one unique index on messageId
botInfoMessageSchema.index({ messageId: 1 }, { unique: true });

module.exports = mongoose.model('BotInfoMessage', botInfoMessageSchema);
