/**
 * Notification Routes
 * Handles in-app notifications for authenticated users
 */

const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');
const { standardApiRateLimit } = require('../utils/rateLimiter');

// All notification routes are protected
router.use(standardApiRateLimit);
router.use(protect);

router.get('/', notificationController.getNotifications);
router.patch('/:id/read', notificationController.markAsRead);
router.post('/mark-all-read', notificationController.markAllAsRead);
router.delete('/:id', notificationController.deleteNotification);

module.exports = router;
