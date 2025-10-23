/**
 * Test Uptime Fix
 * Verifies that the uptime tracking is working correctly
 */

const { metrics } = require('./src/utils/metrics');

console.log('🧪 Testing Uptime Fix\n');

// Simulate bot startup
console.log('1️⃣ Simulating bot startup...');
console.log('   - Initial uptime:', metrics.getUptime());

// Set bot ready time (simulating when bot becomes ready)
console.log('\n2️⃣ Setting bot ready time...');
metrics.setBotReadyTime();
console.log('   - Bot ready time set');

// Wait a moment to simulate some uptime
console.log('\n3️⃣ Waiting 2 seconds to simulate uptime...');
setTimeout(() => {
    console.log('   - Uptime after 2 seconds:', metrics.getUptime());
    
    // Test health metrics
    console.log('\n4️⃣ Testing health metrics...');
    const health = metrics.getHealthMetrics();
    console.log('   - Uptime:', health.uptime);
    console.log('   - Uptime Hours:', health.uptimeHours.toFixed(2));
    console.log('   - Commands/Hour:', health.commandsPerHour.toFixed(2));
    
    // Test with some activity
    console.log('\n5️⃣ Adding some activity...');
    metrics.trackCommand('test', 'user1', 100, true);
    metrics.trackCommand('help', 'user2', 150, true);
    metrics.trackInteraction();
    metrics.trackMessage();
    
    const healthAfter = metrics.getHealthMetrics();
    console.log('   - Commands/Hour after activity:', healthAfter.commandsPerHour.toFixed(2));
    console.log('   - Error Rate:', healthAfter.errorRate.toFixed(2) + '%');
    
    console.log('\n✅ Uptime fix test completed!');
    console.log('\n📊 Expected results when bot starts:');
    console.log('   - Uptime should show actual bot running time');
    console.log('   - Commands/Hour should calculate correctly');
    console.log('   - Error rates should be accurate');
    console.log('   - All metrics should update in real-time');
    
}, 2000);
