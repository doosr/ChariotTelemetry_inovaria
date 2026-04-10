const mongoose = require('mongoose');

const braceletSchema = new mongoose.Schema({
    ownerId: { type: String, required: true },
    deviceId: { type: String, required: true, unique: true, trim: true },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    battery: { type: Number, default: 0 },
    heartRate: { type: Number, default: 0 },
    spo2: { type: Number, default: 0 },
    temperature: { type: Number, default: 0 },
    lastSeen: { type: Date, default: Date.now },
    addedDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Bracelet', braceletSchema);
