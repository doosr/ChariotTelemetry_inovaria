const mongoose = require('mongoose');

const calibrationSchema = new mongoose.Schema({
    deviceId: { type: String, default: 'truck_01', index: true },
    timestamp: { type: Date, default: Date.now },
    fuelEmpty: Number,
    fuelFull: Number,
    fuelTank: Number,
    tempBeta: Number,
    tempR0: Number,
    tempOffset: Number
});

module.exports = mongoose.model('Calibration', calibrationSchema);
