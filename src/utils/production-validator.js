/**
 * Production Environment Validator
 * Ensures all required environment variables and configurations are present
 */

const fs = require('fs');
// const path = require('path'); // Not used

class ProductionValidator {
    constructor() {
        this.requiredEnvVars = [
            'DISCORD_TOKEN',
            'MONGODB_URI',
            'CLIENT_ID',
            'GUILD_ID'
        ];
        
        this.optionalEnvVars = [
            'WOS_API_SECRET',
            'GEMINI_API_KEY',
            'TWO_CAPTCHA_API_KEY',
            'MEMBER_ROLE_ID',
            'BT1_ROLE_ID',
            'BT2_ROLE_ID'
        ];
        
        this.criticalPaths = [
            'src/commands',
            'src/events',
            'src/utils',
            'src/database',
            'package.json'
        ];
    }

    /**
     * Validates production environment
     * @returns {Object} Validation result
     */
    validateProductionEnvironment() {
        const results = {
            isValid: true,
            errors: [],
            warnings: [],
            recommendations: []
        };

        // Check required environment variables
        this.validateEnvironmentVariables(results);
        
        // Check critical files and directories
        this.validateFileStructure(results);
        
        // Check MongoDB connection
        this.validateMongoDBConnection(results);
        
        // Check Discord token format
        this.validateDiscordToken(results);
        
        // Check production-specific settings
        this.validateProductionSettings(results);

        return results;
    }

    /**
     * Validates environment variables
     */
    validateEnvironmentVariables(results) {
        // Check required variables
        for (const envVar of this.requiredEnvVars) {
            if (!process.env[envVar]) {
                results.errors.push(`Missing required environment variable: ${envVar}`);
                results.isValid = false;
            }
        }

        // Check optional variables and provide recommendations
        for (const envVar of this.optionalEnvVars) {
            if (!process.env[envVar]) {
                results.warnings.push(`Optional environment variable not set: ${envVar}`);
                results.recommendations.push(`Consider setting ${envVar} for enhanced functionality`);
            }
        }

        // Check for development variables in production
        if (process.env.NODE_ENV === 'production') {
            if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
                results.warnings.push('Development environment variables detected in production');
                results.recommendations.push('Remove DEBUG and set NODE_ENV=production');
            }
        }
    }

    /**
     * Validates file structure
     */
    validateFileStructure(results) {
        for (const pathToCheck of this.criticalPaths) {
            if (!fs.existsSync(pathToCheck)) {
                results.errors.push(`Critical path missing: ${pathToCheck}`);
                results.isValid = false;
            }
        }

        // Check for package.json
        if (fs.existsSync('package.json')) {
            try {
                const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
                
                // Check for required dependencies
                const requiredDeps = ['discord.js', 'mongoose', 'dotenv'];
                for (const dep of requiredDeps) {
                    if (!packageJson.dependencies[dep]) {
                        results.errors.push(`Missing required dependency: ${dep}`);
                        results.isValid = false;
                    }
                }

                // Check for scripts
                if (!packageJson.scripts.start) {
                    results.warnings.push('No start script defined in package.json');
                    results.recommendations.push('Add "start": "node index.js" to package.json scripts');
                }

            } catch (error) {
                results.errors.push(`Invalid package.json: ${error.message}`);
                results.isValid = false;
            }
        }
    }

    /**
     * Validates MongoDB connection string
     */
    validateMongoDBConnection(results) {
        const mongoUri = process.env.MONGODB_URI;
        if (mongoUri) {
            // Basic MongoDB URI validation
            if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
                results.errors.push('Invalid MongoDB URI format');
                results.isValid = false;
            }

            // Check for localhost in production
            if (process.env.NODE_ENV === 'production' && mongoUri.includes('localhost')) {
                results.warnings.push('Using localhost MongoDB in production');
                results.recommendations.push('Use MongoDB Atlas or production MongoDB instance');
            }
        }
    }

    /**
     * Validates Discord token format
     */
    validateDiscordToken(results) {
        const token = process.env.DISCORD_TOKEN;
        if (token) {
            // Basic Discord token validation
            if (token.length < 50) {
                results.errors.push('Discord token appears to be invalid (too short)');
                results.isValid = false;
            }

            // Check for bot token format
            if (!token.includes('.')) {
                results.errors.push('Discord token format appears invalid');
                results.isValid = false;
            }
        }
    }

    /**
     * Validates production-specific settings
     */
    validateProductionSettings(results) {
        // Check for proper logging configuration
        if (!process.env.LOG_LEVEL) {
            results.recommendations.push('Set LOG_LEVEL environment variable (e.g., LOG_LEVEL=info)');
        }

        // Check for error reporting
        if (!process.env.ERROR_WEBHOOK_URL) {
            results.recommendations.push('Consider setting ERROR_WEBHOOK_URL for production error reporting');
        }

        // Check for monitoring
        if (!process.env.MONITORING_ENABLED) {
            results.recommendations.push('Enable monitoring with MONITORING_ENABLED=true');
        }
    }

    /**
     * Generates production configuration report
     */
    generateProductionReport() {
        const validation = this.validateProductionEnvironment();
        
        console.log('\n🔍 Production Environment Validation Report');
        console.log('==========================================');
        
        if (validation.isValid) {
            console.log('✅ Environment validation passed!');
        } else {
            console.log('❌ Environment validation failed!');
        }

        if (validation.errors.length > 0) {
            console.log('\n🚨 Critical Errors:');
            validation.errors.forEach(error => console.log(`  • ${error}`));
        }

        if (validation.warnings.length > 0) {
            console.log('\n⚠️  Warnings:');
            validation.warnings.forEach(warning => console.log(`  • ${warning}`));
        }

        if (validation.recommendations.length > 0) {
            console.log('\n💡 Recommendations:');
            validation.recommendations.forEach(rec => console.log(`  • ${rec}`));
        }

        console.log('\n==========================================\n');
        
        return validation;
    }
}

module.exports = ProductionValidator;
