const mongoose = require('mongoose');

const RedemptionHistorySchema = new mongoose.Schema({
  fid: { type: String, required: true, index: true },
  code: { type: String, required: true, index: true },
  redeemedAt: { type: Date, default: Date.now },
});

RedemptionHistorySchema.index({ fid: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('RedemptionHistory', RedemptionHistorySchema);