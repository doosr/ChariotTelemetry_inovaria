const Machine = require('../models/Machine');
const Telemetry = require('../models/Telemetry');

// GET /api/machines?ownerId=xxx&includeTelemetry=true
exports.getMachines = async (req, res) => {
    try {
        const { ownerId, requesterRole, includeTelemetry, technicianId } = req.query;

        let query = {};
        if (requesterRole === 'Super Admin') {
            const User = require('../models/User');
            // If ownerId is provided, focus on that target and its sub-admins
            // If not, use the requester's own context (handled by query below or passed via ownerId)
            if (ownerId) {
                const subAdmins = await User.find({ parentAdminId: ownerId }).select('_id');
                const allowedOwners = [ownerId, ...subAdmins.map(a => a._id.toString())];
                query.ownerId = { $in: allowedOwners };
            } else {
                // Return [] if no ownerId and not System Admin? 
                // Or try to find the requester's own ID if we had it?
                // For now, let's allow System Admin to see all, and others must provide ownerId or be Tech.
                if (requesterRole !== 'System Admin' && !ownerId) {
                    return res.json([]);
                }
            }
        } else if (requesterRole !== 'System Admin' && ownerId) {
            query.ownerId = ownerId;
        } else if (requesterRole !== 'System Admin' && !ownerId) {
            return res.json([]);
        }

        if (requesterRole === 'Technicien' && technicianId) {
            const User = require('../models/User');
            const techInfo = await User.findById(technicianId).select('assignedMachines');
            if (techInfo && techInfo.assignedMachines && techInfo.assignedMachines.length > 0) {
                // Delete ownerId to prioritize assignedMachines for Technician
                delete query.ownerId;
                query.deviceId = { $in: techInfo.assignedMachines };
            } else {
                return res.json([]);
            }
        }

        const machines = await Machine.find(query).sort({ addedDate: 1 }).lean();

        if (includeTelemetry === 'true') {
            const machinesWithTele = await Promise.all(machines.map(async (m) => {
                const latest = await Telemetry.findOne({ deviceId: m.deviceId }).sort({ timestamp: -1 }).lean();
                return { ...m, telemetry: latest || null };
            }));
            return res.json(machinesWithTele);
        }

        res.json(machines);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/machines
exports.createMachine = async (req, res) => {
    try {
        const { ownerId, deviceId, name, model, serial, description } = req.body;
        if (!ownerId || !deviceId || !name || !model) {
            return res.status(400).json({ error: 'ownerId, deviceId, name et model sont requis' });
        }
        const existing = await Machine.findOne({ deviceId });
        if (existing) return res.status(409).json({ error: `Un chariot avec le Device ID "${deviceId}" existe déjà` });

        const machine = await Machine.create({ ownerId, deviceId, name, model, serial: serial || '', description: description || '' });
        res.status(201).json(machine);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/machines/:deviceId — mise à jour statut / santé depuis télémétrie
exports.updateMachine = async (req, res) => {
    try {
        const machine = await Machine.findOneAndUpdate(
            { deviceId: req.params.deviceId },
            { $set: req.body },
            { new: true }
        );
        if (!machine) return res.status(404).json({ error: 'Chariot introuvable' });
        res.json(machine);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// DELETE /api/machines/:deviceId
exports.deleteMachine = async (req, res) => {
    try {
        await Machine.findOneAndDelete({ deviceId: req.params.deviceId });
        await Telemetry.deleteMany({ deviceId: req.params.deviceId });
        res.json({ message: 'Machine supprimée avec succès' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/machines/:deviceId/owner
exports.updateMachineOwner = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { newOwnerId } = req.body;
        if (!newOwnerId) return res.status(400).json({ error: "newOwnerId est requis." });

        const machine = await Machine.findOneAndUpdate(
            { deviceId },
            { ownerId: newOwnerId },
            { new: true }
        );
        if (!machine) return res.status(404).json({ error: "Machine non trouvée." });

        res.json({ message: "Propriétaire mis à jour avec succès", machine });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/machines/:deviceId — Main update endpoint (Geofence, Name, etc.)
exports.updateMachine = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const updateData = req.body;

        // Prevent updating deviceId or ownerId via this generic endpoint
        delete updateData.deviceId;
        delete updateData.ownerId;

        const machine = await Machine.findOneAndUpdate(
            { deviceId },
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!machine) {
            return res.status(404).json({ error: "Machine non trouvée." });
        }

        res.json({ message: "Machine mise à jour avec succès", machine });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// PUT /api/machines/:deviceId/technicians
exports.updateMachineTechnicians = async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { technicianIds } = req.body; // Array of user IDs
        if (!Array.isArray(technicianIds)) return res.status(400).json({ error: "technicianIds doit être un tableau." });

        const User = require('../models/User');

        await User.updateMany(
            { assignedMachines: deviceId },
            { $pull: { assignedMachines: deviceId } }
        );

        if (technicianIds.length > 0) {
            await User.updateMany(
                { _id: { $in: technicianIds } },
                { $addToSet: { assignedMachines: deviceId } }
            );
        }

        res.json({ message: "Accès techniciens mis à jour avec succès" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
