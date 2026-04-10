const Notification = require('../models/Notification');
// GET /api/notifications
exports.getNotifications = async (req, res) => {
    try {
        const { ownerId, deviceId, limit, requesterRole } = req.query;
        let query = {};
        // Si c'est le System Admin, pas besoin de filtrer par ownerId
        if (requesterRole === 'System Admin') {
            if (deviceId) query.deviceId = deviceId;
        } else {
            if (!ownerId && !deviceId) return res.json([]); // Sécurité
            if (ownerId) query.ownerId = ownerId;
            if (deviceId) query.deviceId = deviceId;
        }
        // Filtre de confidentialité: Les techniciens ne doivent pas voir les alertes de vol de carburant
        if (requesterRole === 'Technicien') {
            query.title = { $not: /VOL DE GASOIL|FUEL_THEFT|VOL/i };
        }
        const notifications = await Notification.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit) || 50);
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.markAsRead = async (req, res) => {
    try {
        const { deviceId, notifId } = req.body;
        if (notifId) {
            await Notification.findByIdAndUpdate(notifId, { isRead: true });
        } else if (deviceId) {
            await Notification.updateMany({ deviceId, isRead: false }, { isRead: true });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.markAllAsRead = async (req, res) => {
    try {
        const { ownerId, requesterRole, typeGroup } = req.body;
        let query = { isRead: false };
        if (requesterRole !== 'System Admin' && ownerId) query.ownerId = ownerId;
        if (typeGroup === 'reseau') {
            query.$or = [{ deviceId: { $exists: false } }, { deviceId: { $in: ['Global', 'System', '🔐 SECURITE'] } }];
        } else if (typeGroup === 'chariots') {
            query.deviceId = { $exists: true, $nin: ['Global', 'System', '🔐 SECURITE'] };
        }
        await Notification.updateMany(query, { isRead: true });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.clearNotifications = async (req, res) => {
    try {
        const { ownerId, typeGroup, requesterRole } = req.query;
        let query = {};
        if (requesterRole !== 'System Admin' && ownerId) {
            query.ownerId = ownerId;
        }
        if (typeGroup === 'reseau') {
            query.$or = [{ deviceId: { $exists: false } }, { deviceId: { $in: ['Global', 'System', '🔐 SECURITE'] } }];
        } else if (typeGroup === 'chariots') {
            query.deviceId = { $exists: true, $nin: ['Global', 'System', '🔐 SECURITE'] };
        }
        await Notification.deleteMany(query);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.createNotification = async (req, res) => {
    try {
        const { deviceId, title, message, type } = req.body;
        if (!deviceId || !title || !message) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const notif = new Notification({ deviceId, title, message, type: type || 'info' });
        await notif.save();
        res.status(201).json(notif);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
