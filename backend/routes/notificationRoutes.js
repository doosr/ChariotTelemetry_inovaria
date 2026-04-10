const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

router.get('/notifications', notificationController.getNotifications);
router.post('/notifications', notificationController.createNotification);
router.post('/notifications/read', notificationController.markAsRead);
router.post('/notifications/read/all', notificationController.markAllAsRead);
router.delete('/notifications/clear', notificationController.clearNotifications);

module.exports = router;
