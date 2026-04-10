const mongoose = require('mongoose');

const telemetrySchema = new mongoose.Schema({
    deviceId: { type: String, required: true, index: true },
    timestamp: { type: Date, default: Date.now },
    temp: Number,
    oil_pressure: Number,
    fuel_liters: Number,
    fuel_percent: Number,
    rpm: Number,
    gear: Number,
    engine_hours: Number,
    engine_on: Boolean,
    lat: Number,
    lon: Number,
    speed: Number,
    proximity_cm: Number,
    odometer: Number,
    fuel_res: Number,
    temp_res: Number,
    sats: Number,
    pos_mode: String,
    trip: {
        isRunning: Boolean,
        startTime: Date,
        startFuel: Number,
        fuelConsumed: Number,
        mileage: Number
    }
});

module.exports = mongoose.model('Telemetry', telemetrySchema);
