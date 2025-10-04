const mongoose = require('mongoose');

const leaderSchema = new mongoose.Schema({
    discordId: { type: String, required: true, unique: true },
    gameId: { type: String, required: true },
    inGameName: { type: String, required: true },
    alliance: { type: String, required: true },
});

module.exports = mongoose.model('Leader', leaderSchema);
