const mongoose = require('mongoose');

const pollSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    question: { type: String, required: true },
    options: { type: [String], required: true },
    voters: [{
        userId: { type: String, required: true },
        optionIndex: { type: Number, required: true },
    }],
    endTime: { type: Date, default: null },
    status: { type: String, default: 'RUNNING' }, // RUNNING, ENDED
    createdAt: { type: Date, default: Date.now }
});

// Indexes for poll queries (messageId already has unique index)
pollSchema.index({ guildId: 1 }); // Guild-specific polls
pollSchema.index({ status: 1 }); // Status-based queries
pollSchema.index({ endTime: 1 }); // Time-based queries for cleanup
pollSchema.index({ guildId: 1, status: 1 }); // Compound index for active polls
pollSchema.index({ 'voters.userId': 1 }); // User vote lookups

module.exports = mongoose.model('Poll', pollSchema);
