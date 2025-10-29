const RedemptionHistory = require('./models.RedemptionHistory');

/**
 * Filters out users who have already redeemed a code
 * @param {Array} users - Array of user objects { fid, ... }
 * @param {string} code - Gift code
 * @returns {Promise<Array>} Users who have NOT redeemed the code
 */
async function filterAlreadyRedeemed(users, code) {
  const fids = users.map(u => u.fid);
  const already = await RedemptionHistory.find({ fid: { $in: fids }, code }).select('fid');
  const alreadyFids = new Set(already.map(r => r.fid));
  return users.filter(u => !alreadyFids.has(u.fid));
}

module.exports = { filterAlreadyRedeemed };