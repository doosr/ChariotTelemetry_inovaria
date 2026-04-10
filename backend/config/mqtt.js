const mqtt = require('mqtt');

const connectMQTT = (url, options) => {
    const client = mqtt.connect(url, options);

    client.on('connect', () => {
        console.log('✅ Connecté au Broker MQTT');
    });

    client.on('offline', () => {
        console.warn('⚠️ Client MQTT est HORS LIGNE (offline)');
    });

    client.on('reconnect', () => {
        console.log('🔄 Tentative de reconnexion au Broker MQTT...');
    });

    client.on('close', () => {
        console.warn('❌ Connexion MQTT fermée (close)');
    });

    client.on('error', (err) => {
        console.error('❌ Erreur MQTT:', err.message);
    });

    return client;
};

module.exports = connectMQTT;
