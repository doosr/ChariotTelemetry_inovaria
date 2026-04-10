const express = require('express');
const router = express.Router();
const calibrationController = require('../controllers/calibrationController');

router.get('/calibrate', calibrationController.getCalibration);
router.post('/calibrate', calibrationController.calibrate);
router.post('/reset-hours', calibrationController.resetEngineHours);

module.exports = router;
