const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  discordId: {
    type: String,
    required: [true, 'Discord ID is required'],
    unique: true,
    index: true,
    minlength: [17, 'Discord ID must be at least 17 characters'],
    maxlength: [19, 'Discord ID must be at most 19 characters']
  },
  gameId: {
    type: String,
    required: function() {
      return this.verified === true;
    },
    minlength: [6, 'Game ID must be at least 6 characters'],
    maxlength: [15, 'Game ID must be at most 15 characters'],
    index: true
  },
  nickname: {
    type: String,
    required: function() {
      return this.verified === true;
    },
    maxlength: [50, 'Nickname must be at most 50 characters'],
    trim: true
  },
  furnaceLevel: {
    type: String,
    maxlength: [20, 'Furnace level must be at most 20 characters'],
    default: null
  },
  verified: {
    type: Boolean,
    default: false,
    required: true,
    index: true
  },
  avatar_image: {
    type: String,
    default: null
  },
  roles: {
    type: [String],
    default: []
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt fields automatically
  collection: 'users'
});

// Compound index for common queries (find verified users with gameId)
userSchema.index({ verified: 1, gameId: 1 });

// Pre-save hook to ensure data consistency
userSchema.pre('save', function(next) {
  // Trim whitespace from string fields
  if (this.nickname) this.nickname = this.nickname.trim();
  if (this.furnaceLevel) this.furnaceLevel = this.furnaceLevel.trim();
  next();
});

module.exports = mongoose.model('User', userSchema);