const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
// Imports MVC Config & Services
// Note: On est déjà dans le dossier backend, donc on utilise des chemins relatifs directs
const connectDB = require('./config/db');
const connectMQTT = require('./config/mqtt');
const { initMQTTService } = require('./services/mqttService');
// Imports MVC Routes
const telemetryRoutes = require('./routes/telemetryRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const userController = require('./controllers/userController');
const app = express();
const PORT = process.env.PORT || 3000;
// --- CONFIGURATION ---
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/oldTruck';
const MQTT_URL = process.env.MQTT_URL || 'mqtt://mqtt-dashboard.com';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'feeds/truck-telemetry';
// Middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
    next();
});
// --- INITIALIZATION ---
// 1. Database
connectDB(MONGODB_URI).then(() => {
    userController.seedDefaultAdmin();
});
// 2. MQTT
const mqttOptions = {
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASSWORD,
    clientId: 'truck_backend_' + Math.random().toString(16).substr(2, 8),
    keepalive: 60,
    reconnectPeriod: 1000, // Reconnect every 1s
    connectTimeout: 30 * 1000,
    clean: true
};
const mqttClient = connectMQTT(MQTT_URL, mqttOptions);
// Topics VPS Stagiaires (dawser)
/*
const MQTT_TOPICS = [
    'stagiaires/dawser/data',     // Données télémétrie
    'stagiaires/dawser/sensors',  // Capteurs
    'stagiaires/dawser/status',   // Statut
];
initMQTTService(mqttClient, MQTT_TOPICS);
*/
initMQTTService(mqttClient, [MQTT_TOPIC, 'feeds/truck-alerts']);
// 3. API Routes
app.use('/api', telemetryRoutes);
app.use('/api', notificationRoutes);
const calibrationRoutes = require('./routes/calibrationRoutes');
app.use('/api', calibrationRoutes);
const userRoutes = require('./routes/userRoutes');
app.use('/api', userRoutes);
const machineRoutes = require('./routes/machineRoutes');
app.use('/api', machineRoutes);
const personnelRoutes = require('./routes/personnelRoutes');
app.use('/api', personnelRoutes);
app.get('/api/status', (req, res) => {
    res.json({
        backend: true,
        mqtt: true, // simplified assumption if service is running
        uptime: process.uptime(),
        version: "2.5"
    });
});
app.use('/api', (req, res) => {
    console.log(`[API 404] ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Route not found' });
});
// 4. Static Files & SPA (Points vers le dossier parent où se trouve index.html)
app.use(express.static(path.join(__dirname, '..')));
// Route racine → page d'accueil
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'accueil.html'));
});
// Catch-all → page d'accueil
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'accueil.html'));

});
// --- START SERVER ---
app.listen(PORT, () => {
    console.log(`🚀 Serveur MVC lancé sur http://localhost:${PORT}`);
    console.log(`📊 API Télémétrie: http://localhost:${PORT}/api/telemetry`);
    console.log(`🔔 API Notifications: http://localhost:${PORT}/api/notifications`);
}).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} occupé. Utilisez 'npx kill-port ${PORT}'`);
        process.exit(1);
    }
});
module.exports = app;
