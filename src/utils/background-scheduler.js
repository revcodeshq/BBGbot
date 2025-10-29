/**
 * Background Task Scheduler
 * Provides intelligent scheduling and resource-aware execution
 */

class BackgroundTaskScheduler {
    constructor() {
        this.tasks = new Map();
        this.intervals = new Map();
        this.isRunning = false;
        this.cpuThreshold = 80; // CPU usage threshold
        this.memoryThreshold = 90; // Memory usage threshold
        this.taskPriorities = new Map();
    }

    /**
     * Registers a background task
     * @param {string} name - Task name
     * @param {Function} taskFunction - Function to execute
     * @param {number} intervalMs - Interval in milliseconds
     * @param {Object} options - Task options
     */
    registerTask(name, taskFunction, intervalMs, options = {}) {
        const task = {
            name,
            function: taskFunction,
            interval: intervalMs,
            lastRun: null,
            nextRun: Date.now() + intervalMs,
            priority: options.priority || 'normal',
            enabled: options.enabled !== false,
            maxExecutionTime: options.maxExecutionTime || 30000, // 30 seconds default
            retryOnFailure: options.retryOnFailure !== false,
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 5000,
            adaptiveInterval: options.adaptiveInterval || false,
            minInterval: options.minInterval || intervalMs,
            maxInterval: options.maxInterval || intervalMs * 10
        };

        this.tasks.set(name, task);
        this.taskPriorities.set(name, task.priority);
        
        console.log(`[Task Scheduler] Registered task: ${name} (${intervalMs}ms interval)`);
    }

    /**
     * Starts the task scheduler
     */
    start() {
        if (this.isRunning) {
            console.warn('[Task Scheduler] Already running');
            return;
        }

        this.isRunning = true;
        console.log('[Task Scheduler] Starting background task scheduler...');

        // Main scheduler loop
        this.scheduleLoop();
        
        // Resource monitoring
        this.startResourceMonitoring();
    }

    /**
     * Stops the task scheduler
     */
    stop() {
        this.isRunning = false;
        
        // Clear all intervals
        for (const [name, intervalId] of this.intervals.entries()) {
            clearInterval(intervalId);
            this.intervals.delete(name);
        }

        console.log('[Task Scheduler] Stopped');
    }

    /**
     * Main scheduling loop
     */
    async scheduleLoop() {
        while (this.isRunning) {
            try {
                await this.executeDueTasks();
                await this.sleep(1000); // Check every second
            } catch (error) {
                console.error('[Task Scheduler] Error in main loop:', error);
                await this.sleep(5000); // Wait 5 seconds on error
            }
        }
    }

    /**
     * Executes tasks that are due
     */
    async executeDueTasks() {
        const now = Date.now();
        const dueTasks = [];

        // Find due tasks
        for (const [, task] of this.tasks.entries()) {
            if (task.enabled && task.nextRun <= now) {
                dueTasks.push(task);
            }
        }

        // Sort by priority
        dueTasks.sort((a, b) => {
            const priorityOrder = { critical: 0, high: 1, normal: 2, low: 3 };
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });

        // Execute tasks
        for (const task of dueTasks) {
            if (this.shouldExecuteTask()) {
                await this.executeTask(task);
            } else {
                console.log(`[Task Scheduler] Skipping ${task.name} due to resource constraints`);
                // Reschedule for later
                task.nextRun = now + 30000; // Try again in 30 seconds
            }
        }
    }

    /**
     * Checks if system resources allow task execution
     * @returns {boolean} True if task can be executed
     */
    shouldExecuteTask() {
        const memUsage = process.memoryUsage();
        const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
        
        // Check memory usage
        if (memUsagePercent > this.memoryThreshold) {
            return false;
        }

        // Check CPU usage (simplified check)
        const cpuUsage = process.cpuUsage();
        if (cpuUsage.user + cpuUsage.system > 1000000) { // 1 second of CPU time
            return false;
        }

        return true;
    }

    /**
     * Executes a single task
     * @param {Object} task - Task to execute
     */
    async executeTask(task) {
        const startTime = Date.now();
        task.lastRun = startTime;

        try {
            console.log(`[Task Scheduler] Executing task: ${task.name}`);
            
            // Set execution timeout
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Task execution timeout')), task.maxExecutionTime);
            });

            // Execute task with timeout
            await Promise.race([
                task.function(),
                timeoutPromise
            ]);

            const executionTime = Date.now() - startTime;
            console.log(`[Task Scheduler] Task ${task.name} completed in ${executionTime}ms`);

            // Update next run time
            this.updateNextRunTime(task, executionTime);

        } catch (error) {
            console.error(`[Task Scheduler] Task ${task.name} failed:`, error.message);
            
            if (task.retryOnFailure) {
                await this.handleTaskRetry(task, error);
            } else {
                // Schedule next run normally
                this.updateNextRunTime(task, Date.now() - startTime);
            }
        }
    }

    /**
     * Handles task retry logic
     * @param {Object} task - Task that failed
     * @param {Error} error - Error that occurred
     */
    async handleTaskRetry(task, _error) {
        const retryCount = task.retryCount || 0;
        
        if (retryCount < task.maxRetries) {
            task.retryCount = retryCount + 1;
            task.nextRun = Date.now() + task.retryDelay;
            console.log(`[Task Scheduler] Retrying ${task.name} in ${task.retryDelay}ms (attempt ${retryCount + 1}/${task.maxRetries})`);
        } else {
            console.error(`[Task Scheduler] Task ${task.name} failed after ${task.maxRetries} retries`);
            task.retryCount = 0; // Reset retry count
            this.updateNextRunTime(task, 0);
        }
    }

    /**
     * Updates next run time for a task
     * @param {Object} task - Task to update
     * @param {number} executionTime - Time taken to execute
     */
    updateNextRunTime(task, executionTime) {
        if (task.adaptiveInterval) {
            // Adaptive interval based on execution time
            const baseInterval = task.interval;
            const executionRatio = executionTime / baseInterval;
            
            if (executionRatio > 0.5) {
                // Task took more than half the interval time, increase interval
                task.interval = Math.min(task.interval * 1.5, task.maxInterval);
            } else if (executionRatio < 0.1) {
                // Task completed quickly, decrease interval
                task.interval = Math.max(task.interval * 0.8, task.minInterval);
            }
        }

        task.nextRun = Date.now() + task.interval;
    }

    /**
     * Starts resource monitoring
     */
    startResourceMonitoring() {
        setInterval(() => {
            const memUsage = process.memoryUsage();
            const memUsagePercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
            
            if (memUsagePercent > this.memoryThreshold) {
                console.warn(`[Task Scheduler] High memory usage: ${memUsagePercent.toFixed(1)}%`);
                this.handleHighMemoryUsage();
            }
        }, 60000); // Check every minute
    }

    /**
     * Handles high memory usage
     */
    handleHighMemoryUsage() {
        // Temporarily disable low priority tasks
        for (const [name, task] of this.tasks.entries()) {
            if (task.priority === 'low') {
                task.enabled = false;
                console.log(`[Task Scheduler] Disabled low priority task: ${name}`);
            }
        }

        // Re-enable after 5 minutes
        setTimeout(() => {
            for (const [name, task] of this.tasks.entries()) {
                if (task.priority === 'low') {
                    task.enabled = true;
                    console.log(`[Task Scheduler] Re-enabled low priority task: ${name}`);
                }
            }
        }, 300000);
    }

    /**
     * Gets task statistics
     * @returns {Object} Task statistics
     */
    getStats() {
        const stats = {
            totalTasks: this.tasks.size,
            enabledTasks: 0,
            disabledTasks: 0,
            tasksByPriority: {},
            nextExecutions: []
        };

        for (const [name, task] of this.tasks.entries()) {
            if (task.enabled) {
                stats.enabledTasks++;
            } else {
                stats.disabledTasks++;
            }

            // Count by priority
            stats.tasksByPriority[task.priority] = (stats.tasksByPriority[task.priority] || 0) + 1;

            // Next executions
            stats.nextExecutions.push({
                name,
                nextRun: new Date(task.nextRun),
                priority: task.priority,
                enabled: task.enabled
            });
        }

        // Sort next executions by time
        stats.nextExecutions.sort((a, b) => a.nextRun - b.nextRun);

        return stats;
    }

    /**
     * Utility function to sleep
     * @param {number} ms - Milliseconds to sleep
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Create singleton instance
const backgroundScheduler = new BackgroundTaskScheduler();

module.exports = {
    BackgroundTaskScheduler,
    backgroundScheduler
};
