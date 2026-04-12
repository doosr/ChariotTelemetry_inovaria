const express = require('express');
const router = express.Router();
const personnelController = require('../controllers/personnelController');

// Workers
router.get('/workers', personnelController.getWorkers);
router.post('/workers', personnelController.createWorker);
router.delete('/workers/:id', personnelController.deleteWorker);

// Bracelets
router.get('/bracelets', personnelController.getBracelets);
router.post('/bracelets', personnelController.createBracelet);
router.delete('/bracelets/:id', personnelController.deleteBracelet);
router.post('/bracelets/assign', personnelController.assignBracelet);
router.post('/bracelets/:deviceId/telemetry', personnelController.updateBraceletTelemetry);
router.get('/bracelets/:deviceId/history', personnelController.getBraceletHistory);

module.exports = router;

