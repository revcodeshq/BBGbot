
![GitHub Repo](https://img.shields.io/github/stars/revcodeshq/BBGbot?style=social)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

# BBG Discord Bot

A comprehensive Discord bot designed for the BBG Alliance, featuring advanced game integration with Whiteout Survival, automated scheduling, giveaway management, and AI-powered features.

**GitHub Repository:** [github.com/revcodeshq/BBGbot](https://github.com/revcodeshq/BBGbot)

> **✨ Now with Centralized Configuration!** All hardcoded values have been moved to environment variables for easy customization across different Discord servers. See [CONFIGURATION.md](CONFIGURATION.md) for details.

## 🌟 Features

### 🎮 Game Integration
- **Player Verification**: Automatic verification system with Whiteout Survival game integration
- **Nickname Sync**: Real-time synchronization of Discord nicknames with in-game names and furnace levels
- **Player Info**: Retrieve detailed player statistics and information
- **Gift Code Redemption**: Automated mass gift code redemption with CAPTCHA solving

### 📅 Scheduling & Automation
- **Smart Announcements**: Schedule announcements with multiple intervals (once, daily, weekly, custom)
- **15/10/5 Minute Warnings**: Automatic warning system for scheduled events
- **Background Tasks**: Automated nickname sync and bot info updates
- **Timer Management**: Create and manage countdown timers

### 🎉 Community Features
- **Giveaway System**: Full-featured giveaway management with role requirements
- **Polling System**: Create polls with multiple options and automatic ending
- **Rally Coordination**: Rally ping system with countdown timers
- **Quote System**: Save and retrieve memorable quotes

### 🤖 AI-Powered Features
- **Translation**: Automatic bidirectional translation (English ↔ Korean) using Google Gemini
- **Guide Assistant**: AI-powered game guide with Google Search grounding
- **Natural Language Processing**: Intent detection for natural command usage

### 🛠️ Admin Tools
- **Role Management**: Automated role assignment and verification
- **Message Pinning**: Easy message pinning with admin controls
- **Bot Info Display**: Dynamic bot information with real-time stats
- **Activity Logging**: Comprehensive logging system for all bot activities

## 📋 Prerequisites

Before setting up the bot, ensure you have:

- **Node.js** v18 or higher
- **MongoDB** database (local or cloud)
- **Discord Bot Token** from [Discord Developer Portal](https://discord.com/developers/applications)
- **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/)
- **2Captcha API Key** from [2Captcha](https://2captcha.com/) (for gift code redemption)

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/revcodeshq/BBGbot.git
   cd BBGbot
   ```

2. **Clean up development files** (optional - removes dev dependencies and files)
   ```bash
   npm run cleanup
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit the `.env` file with your configuration (see [Environment Variables](#environment-variables) section)

5. **Validate your configuration** (optional but recommended)
   ```bash
   npm run validate-config
   ```

6. **Start the bot**
   ```bash
   npm start
   ```

   For production:
   ```bash
   npm run prod
   ```

## 🔧 Environment Variables

Create a `.env` file in the root directory with the following variables:

### Required Variables
```env
# Discord Configuration
BOT_TOKEN=your_discord_bot_token_here
GUILD_ID=your_discord_guild_id_here

# Database Configuration
MONGO_URI=mongodb://localhost:27017/bbgbot

# AI Features
GEMINI_API_KEY=your_gemini_api_key_here

# Game Integration
WOS_API_SECRET=your_whiteout_survival_api_secret

# Role IDs
MEMBER_ROLE_ID=role_id_for_verified_members
BT1_ROLE_ID=role_id_for_bt1_group
BT2_ROLE_ID=role_id_for_bt2_group

# CAPTCHA Solving (Optional - for gift code redemption)
TWO_CAPTCHA_API_KEY=your_2captcha_api_key_here
```

### Optional Variables
All variables have sensible defaults, but you can customize:
- `WOS_API_SECRET`: Defaults to public API secret if not provided
- Channel names for logging are automatically detected

## 🚀 Quick Start

### **Production Deployment**
```bash
# Clone repository
git clone https://github.com/revcodeshq/BBGbot.git
cd BBGbot

# Clean up development files (removes dev dependencies, test files, docs)
npm run cleanup

# Install production dependencies only
npm install --production

# Configure environment
cp .env.example .env
# Edit .env with your production values

# Validate configuration
npm run validate-config

# Start in production mode
npm run prod
```

### **Development Setup**
```bash
# Clone repository
git clone https://github.com/revcodeshq/BBGbot.git
cd BBGbot

# Install all dependencies (including dev tools)
npm install

# Configure environment
cp .env.example .env
# Edit .env with your development values

# Start development server
npm run dev
```

## 🎯 Usage

### Basic Commands

#### User Commands
- `/help` - Display all available commands with descriptions
- `/verify <game_id>` - Verify your account with game integration
- `/playerinfo <game_id>` - Get player statistics and information
- `/avatar [user]` - Display user's avatar
- `/feedback [type]` - Submit feedback about the bot (bug reports, feature requests, general feedback)
- `/changelog [version]` - View recent updates and improvements to the bot
- `/quote add/get/random` - Manage memorable quotes
- `/timer create/list/delete` - Manage countdown timers

#### Community Features
- `/poll create` - Create a poll with multiple options
- `/giveaway start/end/reroll` - Manage giveaways
- `/rally ping/clear` - Coordinate rally activities

#### AI Features
- `/guide <question>` - Ask game-related questions (AI-powered)
- Natural language: Just type commands naturally and the bot will understand

### Admin Commands
- `/schedule create/list/delete` - Manage scheduled announcements
- `/adminverify <user> <game_id>` - Manually verify users
- `/assignrole <user> <BT1|BT2>` - Assign battle group roles
- `/setup-bot-info` - Configure dynamic bot information display
- `/pinmessage <message_id>` - Pin important messages
- `/health` - Check bot health status and diagnostics
- `/metrics` - View bot performance metrics

### Automatic Features
- **Translation**: Messages are automatically translated between English and Korean
- **Nickname Sync**: Player nicknames update automatically every 10 minutes
- **Scheduled Announcements**: Run automatically with warning system
- **Giveaway Management**: Automatic winner selection and notification

## 🏗️ Project Structure

```
BBGbot/
├── index.js                 # Main bot file and initialization
├── package.json            # Dependencies and scripts
├── .env                    # Environment variables (create from .env.example)
├── .gitignore              # Git ignore rules
├── src/
│   ├── commands/           # Slash commands
│   │   ├── help.js
│   │   ├── verify.js
│   │   ├── giveaway.js
│   │   ├── schedule.js
│   │   └── ...
│   ├── events/             # Discord event handlers
│   │   ├── ready.js
│   │   ├── interactionCreate.js
│   │   └── ...
│   ├── database/           # MongoDB models
│   │   ├── models.User.js
│   │   ├── models.Giveaway.js
│   │   └── ...
│   ├── tasks/              # Background tasks
│   │   ├── giveaway-ender.js
│   │   ├── updateBotInfo.js
│   │   └── ...
│   └── utils/              # Utility functions
│       ├── logger.js
│       ├── branding.js
│       └── ...
```

## 🔒 Security Features

- Environment variable configuration for all sensitive data
- Secure API key management
- Role-based permission system
- Comprehensive error handling and logging
- MongoDB injection protection through Mongoose

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🐛 Known Issues

- CAPTCHA solving requires 2Captcha subscription for gift code redemption
- Some game API endpoints may have rate limits
- Translation feature requires stable internet connection

## 🚀 Future Enhancements

- [ ] Web dashboard for bot management
- [ ] Additional game integrations
- [ ] Enhanced analytics and reporting
- [ ] Multi-language support beyond Korean/English
- [ ] Voice channel automation features

## 📞 Support

For support, questions, or feature requests:
- Create an issue on [GitHub](https://github.com/revcodeshq/BBGbot/issues)
- Join the community [Discord](https://discord.gg/cVqGECV2fc) for help
- Contact: Rev (Bot Developer)

## 🏆 Acknowledgments

- Discord.js community for excellent documentation
- Google Gemini AI for translation and guide features
- MongoDB team for reliable database solutions
- BBG Alliance community for feature requests and testing

---

**Made with ❤️ by Rev | Contact if you need services**