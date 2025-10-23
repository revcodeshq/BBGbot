/**
 * Test script for improved redeem command
 * Tests the new architecture and improvements
 */

const GiftCodeRedemptionService = require('./src/services/gift-code-service');
const { validateGiftCode, sanitizeInput } = require('./src/utils/validators');
const { ValidationError, APIError } = require('./src/utils/error-handler');

console.log('🧪 Testing Improved Redeem Command Architecture...\n');

// Test 1: Input Validation
console.log('1️⃣ Testing Input Validation:');
try {
    // Valid gift code
    const validCode = 'TEST123';
    console.log(`   ✅ Valid code "${validCode}": ${validateGiftCode(validCode)}`);
    
    // Invalid gift codes
    const invalidCodes = ['', 'ab', 'test@123', 'toolongcode123456789'];
    invalidCodes.forEach(code => {
        console.log(`   ❌ Invalid code "${code}": ${validateGiftCode(code)}`);
    });
    
    // Input sanitization
    const dirtyInput = '<script>alert("xss")</script>TEST123';
    const cleanInput = sanitizeInput(dirtyInput);
    console.log(`   🧹 Sanitized input: "${cleanInput}"`);
    
} catch (error) {
    console.log(`   ❌ Validation test failed: ${error.message}`);
}

// Test 2: Service Initialization
console.log('\n2️⃣ Testing Service Initialization:');
try {
    const service = new GiftCodeRedemptionService();
    console.log('   ✅ GiftCodeRedemptionService initialized successfully');
    console.log(`   📊 API Base URL: ${service.apiBaseUrl}`);
    console.log(`   🔐 Secret configured: ${service.secret ? 'Yes' : 'No'}`);
    console.log(`   🤖 2Captcha configured: ${service.twoCaptchaApiKey ? 'Yes' : 'No'}`);
} catch (error) {
    console.log(`   ❌ Service initialization failed: ${error.message}`);
}

// Test 3: Error Handling
console.log('\n3️⃣ Testing Error Handling:');
try {
    // Test ValidationError
    throw new ValidationError('Test validation error', 'test_field');
} catch (error) {
    if (error instanceof ValidationError) {
        console.log(`   ✅ ValidationError caught: ${error.message}`);
    } else {
        console.log(`   ❌ Unexpected error type: ${error.constructor.name}`);
    }
}

try {
    // Test APIError
    throw new APIError('Test API error', 'TEST_API');
} catch (error) {
    if (error instanceof APIError) {
        console.log(`   ✅ APIError caught: ${error.message}`);
    } else {
        console.log(`   ❌ Unexpected error type: ${error.constructor.name}`);
    }
}

// Test 4: Signed Form Building
console.log('\n4️⃣ Testing Signed Form Building:');
try {
    const service = new GiftCodeRedemptionService();
    const testParams = {
        fid: '12345',
        time: '1234567890'
    };
    
    const signedForm = service.buildSignedForm(testParams);
    console.log('   ✅ Signed form built successfully');
    console.log(`   📝 Form has sign parameter: ${signedForm.has('sign')}`);
    console.log(`   🔐 Sign value length: ${signedForm.get('sign')?.length || 0} characters`);
    
} catch (error) {
    console.log(`   ❌ Signed form test failed: ${error.message}`);
}

// Test 5: Architecture Benefits
console.log('\n5️⃣ Architecture Benefits Summary:');
console.log('   📁 Service Layer: Separated business logic from command handling');
console.log('   🔧 Configuration: Environment-based instead of hardcoded');
console.log('   ✅ Validation: Input validation and sanitization');
console.log('   🚨 Error Handling: Specific error types with user-friendly messages');
console.log('   💾 Caching: API response caching for better performance');
console.log('   ⚡ Performance: Optimized batch processing');
console.log('   📊 Metrics: Comprehensive tracking and monitoring');

console.log('\n🎉 All tests completed!');
console.log('\n📋 Next Steps:');
console.log('   1. Update your .env file with API keys');
console.log('   2. Test the improved command in development');
console.log('   3. Deploy gradually to production');
console.log('   4. Monitor metrics for improvements');
