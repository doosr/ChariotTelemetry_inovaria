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

// ── 🤖 AI Chat Endpoint (Gemini) ──
const { analyzeTelemetry } = require('./services/aiService');
app.post('/api/ai/chat', async (req, res) => {
    const { question, telemetry, deviceId } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'Clé Gemini non configurée dans .env' });

    const telCtx = telemetry ? `
Données capteurs actuelles:
- Température: ${telemetry.temp !== null && telemetry.temp !== undefined ? telemetry.temp + '°C' : 'NC'}
- Pression huile: ${telemetry.oil_pressure !== null ? telemetry.oil_pressure + ' Bar' : 'NC'}
- Carburant: ${telemetry.fuel_percent !== null ? Math.round(telemetry.fuel_percent) + '%' : 'NC'}
- RPM: ${telemetry.rpm || 0}
- Vitesse: ${telemetry.speed || 0} km/h
- Heures moteur: ${telemetry.engine_hours ? Number(telemetry.engine_hours).toFixed(1) + 'h' : '--'}
- Moteur: ${telemetry.engine_on ? 'EN MARCHE' : 'ARRÊTÉ'}
- Gear: ${telemetry.gear === 1 ? 'AVANT' : telemetry.gear === -1 ? 'ARRIÈRE' : 'NEUTRE'}` : '';

    const prompt = `Tu es un expert en maintenance de chariots élévateurs industriels. Réponds en français, de façon précise et professionnelle, en 2-4 phrases maximum.${telCtx}\n\nQuestion du technicien: ${question}`;

    try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.4, maxOutputTokens: 300 }
            }),
            signal: AbortSignal.timeout(10000)
        });
        if (!r.ok) return res.status(502).json({ error: 'Erreur Gemini API' });
        const data = await r.json();
        const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Pas de réponse.';
        res.json({ answer });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

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
