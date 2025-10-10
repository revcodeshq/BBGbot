# Configuration Guide

## Overview

The BBG Discord Bot now uses a centralized configuration system that eliminates hardcoded values and makes the bot more flexible and maintainable. All configuration is managed through environment variables defined in a `.env` file.

## Quick Start

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit the `.env` file with your server-specific values:
   ```bash
   # Required - Get these from Discord
   BOT_TOKEN=your_actual_bot_token
   GUILD_ID=your_discord_server_id
   
   # Required - Database connection
   MONGO_URI=mongodb://localhost:27017/bbgbot
   ```

3. Configure your server-specific IDs (see sections below)

## Essential Configuration

### Discord Server Setup

**Role IDs** - Right-click roles in Discord and select "Copy Role ID":
```env
DEFAULT_MEMBER_ROLE_ID=123456789012345678  # Role assigned to new members
MEMBER_ROLE_ID=123456789012345678          # Role for verified members  
```

**Channel IDs** - Right-click channels in Discord and select "Copy Channel ID":
```env
WELCOME_CHANNEL_ID=123456789012345678      # Where welcome messages are sent
ANNOUNCEMENTS_CHANNEL_ID=123456789012345678 # Announcements channel
EVENT_SCHEDULE_CHANNEL_ID=123456789012345678 # Events channel
GENERAL_CHANNEL_ID=123456789012345678       # General chat channel
```

### Welcome Message Customization

```env
WELCOME_MESSAGE_TITLE=Your Alliance Name    # Displayed in welcome messages
VERIFY_CHANNEL_NAME=✅-verify              # Name of verification channel
```

## Configuration Benefits

### Before (Hardcoded)
```javascript
const roleId = '1421959206751440996'; // ❌ Hardcoded
const welcomeChannelId = '1422944137224781866'; // ❌ Hardcoded
```

### After (Configurable)
```javascript
const roleId = get('roles.defaultRole'); // ✅ Configurable
const welcomeChannelId = get('channels.welcome'); // ✅ Configurable
```

## Features

### Automatic Validation
- The bot validates all required configuration on startup
- Clear error messages if configuration is missing
- Prevents runtime errors from missing values

### Graceful Degradation
- Optional channels are checked before use
- Welcome message adapts to available channels
- Non-critical features disable gracefully if not configured

### Environment-Specific Settings
- Different configurations for development/production
- Feature flags to enable/disable functionality
- Flexible deployment across different Discord servers

## Advanced Configuration

### Feature Flags
```env
ENABLE_TRANSLATION=true
ENABLE_GIFT_REDEMPTION=true
ENABLE_AI_GUIDE=true
```

### API Settings
```env
GEMINI_API_KEY=your_gemini_key
WOS_API_SECRET=your_game_api_secret
TWO_CAPTCHA_API_KEY=your_captcha_key  # Optional
```

### Performance Tuning
```env
API_TIMEOUT=30000
NICKNAME_SYNC_INTERVAL=600000
BOT_INFO_UPDATE_INTERVAL=300000
```

## Migration Guide

If you're updating from a version with hardcoded values:

1. **Backup your current configuration** - Note your current role/channel IDs
2. **Copy the new .env.example** to `.env`
3. **Fill in your specific IDs** from step 1
4. **Test the bot** in a development server first
5. **Deploy to production** once verified

## Troubleshooting

### Bot won't start
- Check that `BOT_TOKEN` and `MONGO_URI` are set
- Verify the `.env` file is in the project root
- Ensure no syntax errors in the `.env` file

### Welcome messages not working
- Verify `WELCOME_CHANNEL_ID` is correct
- Check that `DEFAULT_MEMBER_ROLE_ID` exists
- Ensure the bot has permissions in the welcome channel

### Missing channels in welcome message
- Optional channels are only shown if configured
- Add the missing channel IDs to your `.env` file
- Restart the bot after configuration changes

## Configuration Reference

See `.env.example` for a complete list of all available configuration options with descriptions and default values.