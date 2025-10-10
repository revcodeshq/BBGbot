#!/usr/bin/env node

/**
 * Configuration Validator for BBG Discord Bot
 * Run this script to validate your .env configuration
 */

require('dotenv').config();
const { validateConfig, get } = require('./src/utils/config');

console.log('🔧 BBG Discord Bot - Configuration Validator\n');

// Check for missing required configuration
const missing = validateConfig();
if (missing.length > 0) {
    console.log('❌ Missing required configuration:');
    missing.forEach(key => console.log(`   - ${key}`));
    console.log('\nPlease check your .env file and ensure all required variables are set.');
    process.exit(1);
}

console.log('✅ All required configuration is present\n');

// Check optional but recommended configuration
const recommendations = [];

if (!get('roles.memberRole')) {
    recommendations.push('MEMBER_ROLE_ID - Role for verified members');
}

if (!get('channels.announcements')) {
    recommendations.push('ANNOUNCEMENTS_CHANNEL_ID - Announcements channel');
}

if (!get('channels.eventSchedule')) {
    recommendations.push('EVENT_SCHEDULE_CHANNEL_ID - Event schedule channel');
}

if (!get('channels.general')) {
    recommendations.push('GENERAL_CHANNEL_ID - General chat channel');
}

if (!get('api.geminiApiKey')) {
    recommendations.push('GEMINI_API_KEY - Required for AI features');
}

if (recommendations.length > 0) {
    console.log('⚠️  Recommended configuration (some features may be limited):');
    recommendations.forEach(item => console.log(`   - ${item}`));
    console.log();
}

// Display current configuration (without sensitive values)
console.log('📋 Current Configuration Summary:');
console.log(`   Guild ID: ${get('discord.guildId') ? '✅ Set' : '❌ Missing'}`);
console.log(`   Default Role: ${get('roles.defaultRole') ? '✅ Set' : '❌ Missing'}`);
console.log(`   Member Role: ${get('roles.memberRole') ? '✅ Set' : '⚠️  Not set'}`);
console.log(`   Welcome Channel: ${get('channels.welcome') ? '✅ Set' : '❌ Missing'}`);
console.log(`   Database: ${get('database.mongoUri') ? '✅ Set' : '❌ Missing'}`);
console.log(`   Gemini API: ${get('api.geminiApiKey') ? '✅ Set' : '⚠️  Not set'}`);

console.log('\n🚀 Configuration validation complete!');

if (missing.length === 0 && recommendations.length === 0) {
    console.log('Your bot is fully configured and ready to run.');
} else if (missing.length === 0) {
    console.log('Your bot can run, but consider setting the recommended variables for full functionality.');
}