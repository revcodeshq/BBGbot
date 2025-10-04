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
});

pollSchema.index({ messageId: 1 });

module.exports = mongoose.model('Poll', pollSchema);
