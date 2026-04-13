const mongoose = require('mongoose');

const braceletHistorySchema = new mongoose.Schema({
    deviceId:    { type: String, required: true, index: true },
    heartRate:   { type: Number, default: null },
    spo2:        { type: Number, default: null },
    temperature: { type: Number, default: null },
    timestamp:   { type: Date,   default: Date.now }
});

// Index composé pour les requêtes par deviceId + timestamp
braceletHistorySchema.index({ deviceId: 1, timestamp: -1 });

// Auto-suppression après 7 jours
braceletHistorySchema.index({ timestamp: 1 }, { expireAfterSeconds: 604800 });

module.exports = mongoose.model('BraceletHistory', braceletHistorySchema);
