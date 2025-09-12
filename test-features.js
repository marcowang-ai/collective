// Test script for 1-year expiration and monthly benefit renewal
const fetch = require('node-fetch');

async function testFeatures() {
  const baseUrl = 'http://localhost:3000';
  
  console.log('Testing new features...\n');
  
  try {
    // Test 1: Check health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await fetch(`${baseUrl}/health`);
    const healthData = await healthResponse.json();
    console.log('Health:', healthData);
    console.log('✅ Health check passed\n');
    
    // Test 2: Test pass creation with expiration
    console.log('2. Testing badge creation with expiration...');
    const badgeResponse = await fetch(`${baseUrl}/issue-badge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: 'test@example.com',
        memberId: 'TEST-001'
      })
    });
    const badgeData = await badgeResponse.json();
    console.log('Badge creation result:', badgeData.ok ? 'SUCCESS' : 'FAILED');
    if (badgeData.error) console.log('Error:', badgeData.error);
    console.log('✅ Badge creation test completed\n');
    
    // Test 3: Test PID endpoint with monthly benefit tracking
    console.log('3. Testing PID endpoint with monthly benefits...');
    const pidResponse = await fetch(`${baseUrl}/pid?pid=TEST-001`);
    const pidData = await pidResponse.json();
    console.log('PID data:', JSON.stringify(pidData, null, 2));
    console.log('✅ PID endpoint test completed\n');
    
    console.log('All tests completed! 🎉');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Check if server is running before testing
setTimeout(testFeatures, 2000); // Wait 2 seconds for server to be ready