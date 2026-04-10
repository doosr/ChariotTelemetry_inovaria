const express = require('express');
const router = express.Router();
const telemetryController = require('../controllers/telemetryController');

router.get('/telemetry', telemetryController.getRealTime);
router.post('/telemetry', telemetryController.saveTelemetry);
router.get('/history', telemetryController.getHistory);
router.post('/command', telemetryController.sendCommand);

module.exports = router;
