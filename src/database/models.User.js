const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  discordId: { type: String, required: true },
  gameId: { type: String },
  nickname: String,
  furnaceLevel: String,
  verified: { type: Boolean, default: false },
  avatar_image: String,
  roles: [String],
  guildId: { type: String }, // Add guildId for multi-guild support
  createdAt: { type: Date, default: Date.now },
  lastActive: { type: Date, default: Date.now }
});

// Critical indexes for performance optimization
userSchema.index({ discordId: 1 }); // Primary lookup
userSchema.index({ gameId: 1 }); // Game data lookups
userSchema.index({ verified: 1 }); // Verification status queries
userSchema.index({ guildId: 1, verified: 1 }); // Compound index for guild-specific verified users
userSchema.index({ discordId: 1, guildId: 1 }); // Compound index for user-guild lookups
userSchema.index({ lastActive: 1 }); // For cleanup queries
userSchema.index({ createdAt: 1 }); // For analytics

module.exports = mongoose.model('User', userSchema);