const { publishCommand } = require('../services/mqttService');

// Command Topic (Must match ESP32 subscription)
const MQTT_COMMAND_TOPIC = 'feeds/truck-commands';

const Calibration = require('../models/Calibration');

exports.calibrate = async (req, res) => {
    try {
        const settings = req.body;
        const deviceId = req.query.deviceId || req.body.deviceId || 'truck_01';

        console.log(`🔧 [${new Date().toLocaleTimeString()}] Requête Calibration pour ${deviceId}:`, settings);

        if (!settings || Object.keys(settings).length === 0) {
            return res.status(400).json({ error: 'Settings are required' });
        }

        // 1. Save to Database (Update existing or create new)
        await Calibration.findOneAndUpdate(
            { deviceId },
            { ...settings, timestamp: new Date() },
            { upsert: true, new: true }
        );
        console.log(`✅ Calibration sauvegardée/mise à jour pour ${deviceId}`);

        // 2. Construct the payload expected by ESP32 (main.cpp:603)
        const payload = {
            command: "UPDATE_CALIB",
            settings: settings
        };

        // 3. Publish to MQTT
        const success = publishCommand(MQTT_COMMAND_TOPIC, payload);

        res.json({
            success: true,
            message: 'Calibration saved and command sent to ESP32',
            mqtt: success
        });
    } catch (err) {
        console.error('❌ Calibration Error:', err);
        res.status(500).json({ message: err.message, stack: err.stack });
    }
};

exports.getCalibration = async (req, res) => {
    try {
        const deviceId = req.query.deviceId || 'truck_01';
        console.log(`📂 [${new Date().toLocaleTimeString()}] Récupération calibration pour ${deviceId}`);
        let query = {};
        if (deviceId) query.deviceId = deviceId;

        const latest = await Calibration.findOne(query).sort({ timestamp: -1 });
        if (!latest) return res.json({});
        res.json(latest);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

exports.resetEngineHours = async (req, res) => {
    try {
        const { deviceId } = req.body;
        if (!deviceId) return res.status(400).json({ error: "deviceId est requis." });

        console.log(`⏳ Reset Engine Hours Request for ${deviceId}`);

        const payload = {
            command: "RESET_HOURS",
            deviceId: deviceId
        };

        const success = publishCommand(MQTT_COMMAND_TOPIC, payload);

        if (success) {
            // OPTIMISTIC DB UPDATE: Set engine_hours to 0 in the latest telemetry record
            // This ensures subsequent GET requests from dashboard return 0 immediately.
            const Telemetry = require('../models/Telemetry');
            const latest = await Telemetry.findOne({ deviceId }).sort({ timestamp: -1 });
            if (latest) {
                latest.engine_hours = 0;
                await latest.save();
                console.log(`✅ Telemetry updated in DB for ${deviceId}: 0h`);
            }

            return res.json({
                success: true,
                message: 'Reset command sent to ESP32 and database updated.'
            });
        } else {
            return res.status(500).json({
                success: false,
                message: 'Failed to publish MQTT command'
            });
        }
    } catch (err) {
        console.error('❌ Reset Hours Error:', err);
        res.status(500).json({ error: err.message });
    }
};
