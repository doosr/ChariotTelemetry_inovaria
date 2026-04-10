const mongoose = require('mongoose');
const machineSchema = new mongoose.Schema({
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deviceId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    model: { type: String, required: true },
    serial: { type: String, default: '' },
    description: { type: String, default: '' },
    addedDate: { type: Date, default: Date.now },
    lastSeen: { type: Date, default: Date.now },
    status: { type: String, enum: ['online', 'offline'], default: 'offline' },
    health: {
        temp: { type: String, default: null },
        oil: { type: String, default: null },
        fuel: { type: Number, default: 0 },
        // Connection status tracking
        temp_nc: { type: Boolean, default: false },
        fuel_nc: { type: Boolean, default: false }
    },
    trip: {
        isRunning: { type: Boolean, default: false },
        startTime: { type: Date, default: null },
        startFuel: { type: Number, default: 0 },
        fuelConsumed: { type: Number, default: 0 },
        mileage: { type: Number, default: 0 },
        lastLat: { type: Number, default: null },
        lastLon: { type: Number, default: null },
        lastCalcTime: { type: Date, default: null },
        lastFuelLevel: { type: Number, default: null }
    },
    odometer: { type: Number, default: 0 },
    lastFuelLiters: { type: Number, default: 0 },
    maintenance: {
        lastOilChangeHours: { type: Number, default: 0 },
        nextOilChangeHours: { type: Number, default: 500 },
        lastOilChangeKm: { type: Number, default: 0 },
        nextOilChangeKm: { type: Number, default: 10000 },
        engineHours: { type: Number, default: 0 }
    },
    geofence: {
        type: { type: String, enum: ['circle', 'polygon'], default: 'circle' },
        coordinates: { type: Array, default: [] }, // For polygons: [{lat, lon}, ...]
        lat: { type: Number, default: null }, // For circle
        lon: { type: Number, default: null }, // For circle
        radius: { type: Number, default: 50 },
        isActive: { type: Boolean, default: false }
    }
});
module.exports = mongoose.model('Machine', machineSchema);