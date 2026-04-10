const axios = require('axios');

async function testAlert() {
    try {
        const response = await axios.post('http://localhost:3000/api/notifications', {
            deviceId: 'test_truck_001',
            title: '🚨 Test Geofence',
            message: 'Ceci est une alerte de test pour le géofencing.',
            type: 'danger'
        });
        console.log('✅ Alert success:', response.data);
    } catch (error) {
        console.error('❌ Alert failed:', error.response ? error.response.data : error.message);
    }
}

testAlert();