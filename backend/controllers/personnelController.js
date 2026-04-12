const Worker = require('../models/Worker');
const Bracelet = require('../models/Bracelet');
const BraceletHistory = require('../models/BraceletHistory');

// --- WORKERS ---

exports.getWorkers = async (req, res) => {
    try {
        const { ownerId } = req.query;
        if (!ownerId) return res.json([]);
        const workers = await Worker.find({ ownerId }).populate('braceletId').sort({ addedDate: -1 });
        res.json(workers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createWorker = async (req, res) => {
    try {
        const { ownerId, name, role } = req.body;
        if (!ownerId || !name) return res.status(400).json({ error: 'ownerId and name are required' });
        const worker = await Worker.create({ ownerId, name, role });
        res.status(201).json(worker);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteWorker = async (req, res) => {
    try {
        await Worker.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- BRACELETS ---

exports.getBracelets = async (req, res) => {
    try {
        const { ownerId } = req.query;
        // '__all__' permet au modal de détail de chercher n'importe quel bracelet
        const filter = (!ownerId || ownerId === '__all__') ? {} : { ownerId };
        const bracelets = await Bracelet.find(filter).sort({ addedDate: -1 });
        res.json(bracelets);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createBracelet = async (req, res) => {
    try {
        const { ownerId, deviceId } = req.body;
        if (!ownerId || !deviceId) return res.status(400).json({ error: 'ownerId and deviceId are required' });

        const existing = await Bracelet.findOne({ deviceId });
        if (existing) return res.status(409).json({ error: 'Bracelet already exists' });

        const bracelet = await Bracelet.create({ ownerId, deviceId });
        res.status(201).json(bracelet);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.assignBracelet = async (req, res) => {
    try {
        const { workerId, braceletId } = req.body;
        // Unassign bracelet from anyone else first (if unique assignment required)
        if (braceletId) await Worker.updateMany({ braceletId }, { braceletId: null });

        await Worker.findByIdAndUpdate(workerId, { braceletId });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteBracelet = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const bracelet = await Bracelet.findOne({ deviceId });
        if (bracelet) {
            await Worker.updateMany({ braceletId: bracelet._id }, { braceletId: null });
            await Bracelet.deleteOne({ deviceId });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.updateBraceletTelemetry = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { heartRate, spo2, battery, status, temperature } = req.body;

        const updateData = {
            lastSeen: new Date(),
            status: status || 'online'
        };

        if (heartRate !== undefined) updateData.heartRate = heartRate;
        if (spo2 !== undefined) updateData.spo2 = spo2;
        if (battery !== undefined) updateData.battery = battery;
        if (temperature !== undefined) updateData.temperature = temperature;

        const bracelet = await Bracelet.findOneAndUpdate(
            { deviceId },
            { $set: updateData },
            { new: true, upsert: false }
        );

        if (!bracelet) return res.status(404).json({ error: 'Bracelet not registered' });

        // --- Sauvegarder dans l'historique pour les graphiques ---
        const hasData = heartRate !== undefined || spo2 !== undefined || temperature !== undefined;
        if (hasData) {
            await BraceletHistory.create({
                deviceId,
                heartRate:   heartRate   !== undefined ? heartRate   : null,
                spo2:        spo2        !== undefined ? spo2        : null,
                temperature: temperature !== undefined ? temperature : null,
            });
        }

        res.json({ success: true, bracelet });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Historique d'un bracelet (dernières N entrées) pour les graphiques
exports.getBraceletHistory = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const history = await BraceletHistory.find({ deviceId })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
        // Retourner dans l'ordre chronologique pour Chart.js
        res.json(history.reverse());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

