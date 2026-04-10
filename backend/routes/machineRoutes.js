const express = require('express');
const router = express.Router();
const machineController = require('../controllers/machineController');

router.get('/machines', machineController.getMachines);
router.post('/machines', machineController.createMachine);
router.put('/machines/:deviceId', machineController.updateMachine);
router.delete('/machines/:deviceId', machineController.deleteMachine);

router.put('/machines/:deviceId/owner', machineController.updateMachineOwner);
router.put('/machines/:deviceId/technicians', machineController.updateMachineTechnicians);

module.exports = router;
