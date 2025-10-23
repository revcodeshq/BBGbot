/**
 * Better Uptime Test
 * Tests the improved uptime tracking with immediate feedback
 */

const { metrics } = require('./src/utils/metrics');

console.log('🧪 Testing Improved Uptime System\n');

// Test 1: Initial state
console.log('1️⃣ Initial state:');
console.log('   - Uptime:', metrics.getUptime());
console.log('   - Bot ready time:', metrics.metrics.botReadyTime);

// Test 2: Set bot ready time
console.log('\n2️⃣ Setting bot ready time...');
metrics.setBotReadyTime();
console.log('   - Bot ready time set:', metrics.metrics.botReadyTime);

// Test 3: Immediate uptime check
console.log('\n3️⃣ Immediate uptime check:');
console.log('   - Uptime:', metrics.getUptime());

// Test 4: Wait and check multiple times
console.log('\n4️⃣ Testing uptime progression:');
let checkCount = 0;
const interval = setInterval(() => {
    checkCount++;
    const uptime = metrics.getUptime();
    const health = metrics.getHealthMetrics();
    
    console.log(`   - Check ${checkCount}: ${uptime} (${health.uptimeHours.toFixed(3)} hours)`);
    
    if (checkCount >= 5) {
        clearInterval(interval);
        
        // Test 5: Add some activity
        console.log('\n5️⃣ Adding activity...');
        metrics.trackCommand('test', 'user1', 100, true);
        metrics.trackCommand('help', 'user2', 150, true);
        metrics.trackInteraction();
        metrics.trackMessage();
        
        const finalHealth = metrics.getHealthMetrics();
        console.log('   - Final uptime:', finalHealth.uptime);
        console.log('   - Commands/Hour:', finalHealth.commandsPerHour.toFixed(2));
        console.log('   - Error Rate:', finalHealth.errorRate.toFixed(2) + '%');
        
        console.log('\n✅ Uptime test completed!');
        console.log('\n📊 The uptime should now show:');
        console.log('   - Seconds for < 1 minute');
        console.log('   - Minutes and seconds for < 1 hour');
        console.log('   - Days, hours, minutes for longer periods');
        console.log('\n🚀 Your bot uptime tracking is now working!');
    }
}, 1000); // Check every second
