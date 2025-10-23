# Testing Guide for BBG Discord Bot Improvements

## 🧪 Testing Strategy Overview

This guide covers multiple testing approaches for your enhanced Discord bot, from basic functionality tests to advanced performance and error handling validation.

## 1. 🚀 **Quick Start Testing**

### Basic Functionality Test
```bash
# Start the bot
npm start

# In Discord, test these commands:
/help                    # Should show all commands
/verify                  # Should open verification modal
/metrics                 # Should display bot metrics (admin only)
```

### Verification Flow Test
1. **Click "Start Verification"** button
2. **Enter a test FID** (6-15 digits)
3. **Submit the modal**
4. **Check verification logs channel** for the request
5. **Test approve/reject buttons** in verification logs

## 2. 🔍 **Handler Module Testing**

### Test Individual Handlers

#### Verification Handler Test
```javascript
// Test in Discord:
1. /verify command
2. Enter invalid FID (too short/long) - should show validation error
3. Enter valid FID - should create verification request
4. Test approve/reject buttons
```

#### Poll Handler Test
```javascript
// Test poll creation and voting:
1. Create a poll with /poll create
2. Vote on different options
3. Check vote counting works correctly
4. Test duplicate vote prevention
```

#### Reminder Handler Test
```javascript
// Test reminder creation:
1. Use natural language time inputs:
   - "in 5 minutes"
   - "at 3pm EST"
   - "tomorrow at 9am"
2. Test invalid time formats
3. Check scheduled announcements work
```

## 3. 🛡️ **Input Validation Testing**

### Validation Test Cases
```javascript
// Test these inputs in verification modal:

// Valid FIDs:
"123456"     // ✅ Should work
"123456789"  // ✅ Should work
"123456789012345" // ✅ Should work

// Invalid FIDs:
"12345"      // ❌ Too short
"1234567890123456" // ❌ Too long
"abc123"     // ❌ Contains letters
""           // ❌ Empty
"   "        // ❌ Whitespace only
```

### Security Testing
```javascript
// Test XSS prevention:
"<script>alert('xss')</script>"  // Should be sanitized
"javascript:alert('xss')"        // Should be blocked
"<img src=x onerror=alert('xss')>" // Should be sanitized
```

## 4. ⚡ **Performance Testing**

### Cache Testing
```javascript
// Test caching by:
1. Running verification for same FID multiple times
2. Check console logs for "Cache hit" vs "API call"
3. Wait 5+ minutes and test again (cache should expire)
```

### Batch Processing Test
```javascript
// Test nickname sync optimization:
1. Add multiple verified users to database
2. Monitor console during nickname sync
3. Should see batched processing instead of sequential
4. Check execution time improvements
```

## 5. 🚨 **Error Handling Testing**

### API Error Simulation
```javascript
// Test error handling by:
1. Disconnecting internet during API call
2. Using invalid API keys
3. Testing with non-existent FIDs
4. Check error messages are user-friendly
```

### Rate Limiting Test
```javascript
// Test rate limiting:
1. Rapidly execute same command multiple times
2. Should see rate limit error after threshold
3. Wait and retry - should work again
```

## 6. 📊 **Metrics & Monitoring Testing**

### Metrics Command Test
```javascript
// Test /metrics command:
1. Execute various commands first
2. Run /metrics command
3. Check metrics embed shows:
   - Uptime
   - Command counts
   - Error rates
   - Memory usage
   - Top commands
```

### Error Tracking Test
```javascript
// Test error logging:
1. Trigger various errors intentionally
2. Check bot-activity channel for error logs
3. Verify error context is captured
```

## 7. 🔧 **Automated Testing Setup**

### Create Test Script
```javascript
// Create test.js file:
const { Client, GatewayIntentBits } = require('discord.js');

async function runTests() {
    console.log('🧪 Starting Bot Tests...');
    
    // Test 1: Configuration validation
    console.log('✅ Testing configuration...');
    const { validateConfig } = require('./src/utils/config');
    const missing = validateConfig();
    if (missing.length > 0) {
        console.error('❌ Missing config:', missing);
        return;
    }
    console.log('✅ Configuration valid');
    
    // Test 2: Handler imports
    console.log('✅ Testing handler imports...');
    try {
        require('./src/handlers/verification-handler');
        require('./src/handlers/poll-handler');
        require('./src/handlers/reminder-handler');
        console.log('✅ All handlers imported successfully');
    } catch (error) {
        console.error('❌ Handler import failed:', error.message);
    }
    
    // Test 3: Utility functions
    console.log('✅ Testing utility functions...');
    const { validateFID, validateTimeString } = require('./src/utils/validators');
    
    // Test validation functions
    console.log('FID validation:', validateFID('123456')); // Should be true
    console.log('Time validation:', validateTimeString('in 5 minutes')); // Should be true
    
    console.log('🎉 All tests passed!');
}

runTests().catch(console.error);
```

### Run Tests
```bash
node test.js
```

## 8. 🎯 **Integration Testing**

### Full Workflow Test
```javascript
// Test complete user journey:
1. User joins server
2. User runs /verify
3. User submits FID
4. Admin approves verification
5. User gets member role
6. Nickname sync updates user
7. User participates in polls/giveaways
8. Check metrics show all activity
```

## 9. 🚀 **Performance Benchmarking**

### Before vs After Comparison
```javascript
// Measure performance improvements:

// Test nickname sync speed:
console.time('Nickname Sync');
await runNicknameSync(client);
console.timeEnd('Nickname Sync');

// Test command response time:
console.time('Command Execution');
await command.execute(interaction);
console.timeEnd('Command Execution');
```

## 10. 🐛 **Error Recovery Testing**

### Circuit Breaker Test
```javascript
// Test circuit breaker:
1. Simulate API failures (disconnect internet)
2. Trigger multiple failures
3. Check circuit breaker opens
4. Wait for reset timeout
5. Verify circuit breaker closes
```

## 11. 📱 **User Experience Testing**

### UI/UX Testing
```javascript
// Test user interface:
1. Check all embeds display correctly
2. Verify button interactions work
3. Test modal submissions
4. Check error messages are clear
5. Verify success messages are helpful
```

## 12. 🔒 **Security Testing**

### Security Validation
```javascript
// Test security features:
1. Input sanitization
2. XSS prevention
3. SQL injection protection
4. Rate limiting
5. Permission checks
```

## 📋 **Testing Checklist**

### ✅ Basic Functionality
- [ ] Bot starts without errors
- [ ] All commands respond correctly
- [ ] Handlers work independently
- [ ] Database connections work

### ✅ Error Handling
- [ ] Validation errors show user-friendly messages
- [ ] API errors are handled gracefully
- [ ] Rate limiting works correctly
- [ ] Circuit breaker activates properly

### ✅ Performance
- [ ] Caching reduces API calls
- [ ] Batch processing improves speed
- [ ] Memory usage is reasonable
- [ ] Response times are acceptable

### ✅ Security
- [ ] Input validation prevents bad data
- [ ] XSS attacks are blocked
- [ ] Rate limiting prevents abuse
- [ ] Permissions are enforced

### ✅ Monitoring
- [ ] Metrics command shows accurate data
- [ ] Error logging captures context
- [ ] Performance metrics are tracked
- [ ] System health is monitored

## 🎯 **Quick Test Commands**

```bash
# Start bot
npm start

# Test in Discord:
/help
/verify
/metrics
/poll create "Test Poll" "Option 1" "Option 2"
/giveaway start 1h 1 "Test Prize"
/schedule create "Test Event" "in 5 minutes"
```

## 🚨 **Common Issues & Solutions**

### Issue: Handler not found
**Solution**: Check file paths and exports in handler files

### Issue: Validation errors
**Solution**: Verify input format matches validation rules

### Issue: Cache not working
**Solution**: Check TTL settings and cache key generation

### Issue: Metrics not updating
**Solution**: Ensure metrics tracking is called in interactions

---

**🎉 Happy Testing!** Your improved bot should now be more robust, performant, and maintainable than ever before!
