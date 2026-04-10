const Telemetry = require('../models/Telemetry');
const Machine = require('../models/Machine');

exports.getRealTime = async (req, res) => {
    try {
        const { deviceId, ownerId, requesterRole } = req.query;
        if (!deviceId) return res.status(400).json({ error: 'deviceId requis' });

        // Si System Admin, on court-circuite la vérification de propriété
        if (requesterRole !== 'System Admin') {
            if (!ownerId) return res.status(400).json({ error: 'ownerId requis' });
            const machine = await Machine.findOne({ deviceId, ownerId });
            if (!machine) return res.status(403).json({ error: 'Accès non autorisé à cette machine' });
        }

        const latest = await Telemetry.findOne({ deviceId }).sort({ timestamp: -1 });
        if (!latest) return res.json({ status: 'waiting', message: 'En attente de données...' });
        res.json(latest);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getHistory = async (req, res) => {
    try {
        const { deviceId, ownerId, limit, requesterRole } = req.query;
        if (!deviceId) return res.status(400).json({ error: 'deviceId requis' });

        // Si System Admin, on court-circuite la vérification de propriété
        if (requesterRole !== 'System Admin') {
            if (!ownerId) return res.status(400).json({ error: 'ownerId requis' });
            const machine = await Machine.findOne({ deviceId, ownerId });
            if (!machine) return res.status(403).json({ error: 'Accès non autorisé à cette machine' });
        }

        const count = parseInt(limit) || 100;
        const history = await Telemetry.find({ deviceId }).sort({ timestamp: -1 }).limit(count);
        res.json(history.reverse());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.saveTelemetry = async (req, res) => {
    try {
        const data = req.body;
        const deviceId = data.deviceId || 'truck_01';

        console.log(`\n📥 [${new Date().toLocaleTimeString()}] Télémétrie reçue de ${deviceId}:`);
        console.log(`   🌡️ Temp: ${data.temp}°C | 🛢️ Huile: ${data.oil_pressure} Bar | ⛽ Fuel: ${data.fuel_percent}%`);

        const newTelemetry = new Telemetry({ ...data, deviceId });
        await newTelemetry.save();

        res.status(201).json({ status: 'success' });
    } catch (err) {
        console.error('❌ Erreur sauvegarde télémétrie:', err.message);
        res.status(500).json({ error: err.message });
    }
};
const mqttService = require('../services/mqttService');

exports.sendCommand = async (req, res) => {
    try {
        const { deviceId, ownerId, command, requesterRole } = req.body;
        if (!deviceId || !command) {
            return res.status(400).json({ error: 'deviceId et command requis' });
        }

        // Si System Admin, on court-circuite la vérification de propriété
        if (requesterRole !== 'System Admin') {
            if (!ownerId) return res.status(400).json({ error: 'ownerId requis' });
            const machine = await Machine.findOne({ deviceId, ownerId });
            if (!machine) return res.status(403).json({ error: 'Accès non autorisé à cette machine' });
        }

        const topic = `feeds/truck-commands`;
        const payload = {
            command: command,
            state: req.body.state || 'off'
        };
        const success = mqttService.publishCommand(topic, payload);

        if (success) {
            res.json({ status: 'success', message: 'Command published', payload });
        } else {
            res.status(503).json({ error: 'MQTT service unavailable' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
