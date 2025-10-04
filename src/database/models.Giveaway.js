const mongoose = require('mongoose');

const giveawaySchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true, unique: true },
    prize: { type: String, required: true },
    winnerCount: { type: Number, required: true },
    endTime: { type: Date, required: true },
    hostedBy: { type: String, required: true },
    status: { type: String, default: 'RUNNING' }, // RUNNING, ENDED
    winners: { type: [String], default: [] },
    requiredRoleId: { type: String, default: null },
});

giveawaySchema.index({ guildId: 1, status: 1 });

module.exports = mongoose.model('Giveaway', giveawaySchema);
