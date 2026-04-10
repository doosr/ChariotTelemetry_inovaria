const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    deviceId: { type: String, required: true, index: true },
    timestamp: { type: Date, default: Date.now, expires: 604800 }, // Auto-delete after 7 days
    title: String,
    message: String,
    type: { type: String, enum: ['info', 'warning', 'danger', 'success'], default: 'info' },
    isRead: { type: Boolean, default: false }
});

module.exports = mongoose.model('Notification', notificationSchema);
