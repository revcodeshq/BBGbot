const mongoose = require('mongoose');

const quoteSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    text: { type: String, required: true },
    quotedUserId: { type: String, required: true },
    authorId: { type: String, required: true }, // The user who added the quote
    createdAt: { type: Date, default: Date.now },
});

// Indexing for faster lookups
quoteSchema.index({ guildId: 1, quotedUserId: 1 });

module.exports = mongoose.model('Quote', quoteSchema);
