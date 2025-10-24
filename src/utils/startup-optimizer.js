/**
 * Startup Optimization Utilities
 * Provides parallel loading, lazy loading, and optimized initialization
 */

const fs = require('fs');
const path = require('path');

class StartupOptimizer {
    constructor() {
        this.loadedModules = new Map();
        this.loadingPromises = new Map();
        this.criticalModules = new Set([
            'config', 'logger', 'error-handler', 'metrics'
        ]);
        this.optionalModules = new Set([
            'player-info-service', 'announcement-service', 'gift-code-service'
        ]);
    }

    /**
     * Loads modules in parallel for faster startup
     * @param {string} basePath - Base path for modules
     * @param {Array<string>} moduleNames - Names of modules to load
     * @param {boolean} critical - Whether these are critical modules
     * @returns {Promise<Map>} Map of loaded modules
     */
    async loadModulesParallel(basePath, moduleNames, critical = true) {
        const loadPromises = moduleNames.map(async (moduleName) => {
            try {
                const modulePath = path.join(basePath, moduleName);
                const module = await this.loadModule(modulePath);
                return { name: moduleName, module, success: true };
            } catch (error) {
                console.error(`[Startup] Failed to load ${moduleName}:`, error.message);
                if (critical) {
                    throw error;
                }
                return { name: moduleName, module: null, success: false, error };
            }
        });

        const results = await Promise.allSettled(loadPromises);
        const loadedModules = new Map();

        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value.success) {
                loadedModules.set(result.value.name, result.value.module);
            }
        });

        return loadedModules;
    }

    /**
     * Loads a single module with caching
     * @param {string} modulePath - Path to module
     * @returns {Promise<Object>} Loaded module
     */
    async loadModule(modulePath) {
        // Check if already loaded
        if (this.loadedModules.has(modulePath)) {
            return this.loadedModules.get(modulePath);
        }

        // Check if currently loading
        if (this.loadingPromises.has(modulePath)) {
            return this.loadingPromises.get(modulePath);
        }

        // Start loading
        const loadPromise = this._loadModuleInternal(modulePath);
        this.loadingPromises.set(modulePath, loadPromise);

        try {
            const module = await loadPromise;
            this.loadedModules.set(modulePath, module);
            this.loadingPromises.delete(modulePath);
            return module;
        } catch (error) {
            this.loadingPromises.delete(modulePath);
            throw error;
        }
    }

    /**
     * Internal module loading with dynamic import
     * @param {string} modulePath - Path to module
     * @returns {Promise<Object>} Loaded module
     */
    async _loadModuleInternal(modulePath) {
        // Use dynamic import for better performance
        if (modulePath.endsWith('.js')) {
            return require(modulePath);
        } else {
            return require(modulePath + '.js');
        }
    }

    /**
     * Lazy loads commands on demand
     * @param {string} commandsPath - Path to commands directory
     * @returns {Object} Command loader with lazy loading
     */
    createLazyCommandLoader(commandsPath) {
        const commandCache = new Map();
        const self = this; // Capture 'this' context
        
        return {
            async getCommand(commandName) {
                if (commandCache.has(commandName)) {
                    return commandCache.get(commandName);
                }

                const commandFile = path.join(commandsPath, `${commandName}.js`);
                if (fs.existsSync(commandFile)) {
                    const command = await self.loadModule(commandFile);
                    commandCache.set(commandName, command);
                    return command;
                }

                return null;
            },

            async getAllCommands() {
                if (commandCache.size > 0) {
                    return commandCache;
                }

                const commandFiles = fs.readdirSync(commandsPath)
                    .filter(file => file.endsWith('.js'));

                const commands = await self.loadModulesParallel(
                    commandsPath, 
                    commandFiles.map(file => file.replace('.js', '')),
                    false
                );

                commands.forEach((command, name) => {
                    commandCache.set(name, command);
                });

                return commandCache;
            },

            getLoadedCommands() {
                return commandCache;
            }
        };
    }

    /**
     * Lazy loads events on demand
     * @param {string} eventsPath - Path to events directory
     * @returns {Object} Event loader with lazy loading
     */
    createLazyEventLoader(eventsPath) {
        const eventCache = new Map();
        const self = this; // Capture 'this' context
        
        return {
            async getEvent(eventName) {
                if (eventCache.has(eventName)) {
                    return eventCache.get(eventName);
                }

                const eventFile = path.join(eventsPath, `${eventName}.js`);
                if (fs.existsSync(eventFile)) {
                    const event = await self.loadModule(eventFile);
                    eventCache.set(eventName, event);
                    return event;
                }

                return null;
            },

            async loadCriticalEvents(client) {
                const criticalEvents = ['ready', 'interactionCreate', 'messageCreate'];
                
                for (const eventName of criticalEvents) {
                    const event = await this.getEvent(eventName);
                    if (event) {
                        if (event.once) {
                            client.once(event.name, (...args) => event.execute(...args, client));
                        } else {
                            client.on(event.name, (...args) => event.execute(...args, client));
                        }
                        eventCache.set(eventName, event);
                    }
                }
            },

            async loadOptionalEvents(client) {
                const optionalEvents = ['guildMemberAdd', 'voiceStateUpdate', 'translateListener'];
                
                for (const eventName of optionalEvents) {
                    try {
                        const event = await this.getEvent(eventName);
                        if (event) {
                            if (event.once) {
                                client.once(event.name, (...args) => event.execute(...args, client));
                            } else {
                                client.on(event.name, (...args) => event.execute(...args, client));
                            }
                            eventCache.set(eventName, event);
                        }
                    } catch (error) {
                        console.warn(`[Startup] Optional event ${eventName} failed to load:`, error.message);
                    }
                }
            }
        };
    }

    /**
     * Optimized MongoDB connection with robust error handling
     * @param {string} mongoUri - MongoDB connection URI
     * @returns {Promise<boolean>} Connection success status
     */
    async connectMongoDB(mongoUri) {
        const mongodbManager = require('./mongodb-manager');
        
        try {
            const success = await mongodbManager.connect(mongoUri);
            if (success) {
                console.log('[Startup] MongoDB connection established with robust error handling');
            } else {
                console.warn('[Startup] MongoDB connection failed, will retry automatically');
            }
            return success;
        } catch (error) {
            console.error('[Startup] MongoDB connection error:', error);
            return false;
        }
    }

    /**
     * Gets startup statistics
     * @returns {Object} Startup statistics
     */
    getStartupStats() {
        return {
            loadedModules: this.loadedModules.size,
            loadingPromises: this.loadingPromises.size,
            criticalModules: this.criticalModules.size,
            optionalModules: this.optionalModules.size,
            memoryUsage: process.memoryUsage()
        };
    }

    /**
     * Cleans up startup resources
     */
    cleanup() {
        this.loadedModules.clear();
        this.loadingPromises.clear();
    }
}

// Create singleton instance
const startupOptimizer = new StartupOptimizer();

module.exports = {
    StartupOptimizer,
    startupOptimizer
};
