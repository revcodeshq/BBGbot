const mongoose = require('mongoose');


const displayMessageSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
});

// Ensure only one unique index on messageId
displayMessageSchema.index({ messageId: 1 }, { unique: true });

module.exports = mongoose.model('DisplayMessage', displayMessageSchema);