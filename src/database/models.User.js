const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  discordId: String,
  gameId: String,
  nickname: String,
  furnaceLevel: String,
  verified: Boolean,
  avatar_image: String,
  roles: [String]
});
module.exports = mongoose.model('User', userSchema);