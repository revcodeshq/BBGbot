const mongoose = require('mongoose');

const leaderSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    gameId: { type: String, required: true },
    inGameName: { type: String, required: true },
    alliance: { type: String, required: true },
    guildId: { type: String, required: true }, // Add guildId for multi-guild support
    createdAt: { type: Date, default: Date.now },
    lastUpdated: { type: Date, default: Date.now }
});

// Indexes for leader queries (discordId already has unique index)
leaderSchema.index({ gameId: 1 }); // Game data lookups
leaderSchema.index({ alliance: 1 }); // Alliance-based queries
leaderSchema.index({ guildId: 1 }); // Guild-specific leaders
leaderSchema.index({ guildId: 1, alliance: 1 }); // Compound index for guild-alliance queries

module.exports = mongoose.model('Leader', leaderSchema);
