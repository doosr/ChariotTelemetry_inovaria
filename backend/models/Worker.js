const mongoose = require('mongoose');

const workerSchema = new mongoose.Schema({
    ownerId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ['Chauffeur', 'Agent Entrepôt', 'Sécurité'], default: 'Agent Entrepôt' },
    braceletId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bracelet', default: null },
    addedDate: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Worker', workerSchema);
