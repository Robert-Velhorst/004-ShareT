/**
 * Shared Link Routes
 * Handles creation and management of shareable card links
 */

const express = require('express');
const router = express.Router();
const shareController = require('../controllers/shareController');
const { protect } = require('../middleware/auth');
const { owner: requireResourceBalance } = require('../billing/access');

// All routes require authentication
router.use(protect);

// CRUD operations
router.get('/', shareController.getShares);
router.post('/', requireResourceBalance, shareController.createShare);
router.get('/:shareId', shareController.getShare);
router.put('/:shareId', shareController.updateShare);
router.delete('/:shareId', shareController.deleteShare);

// Toggle active status
router.patch('/:shareId/toggle', shareController.toggleActive);

// Get share statistics
router.get('/:shareId/stats', shareController.getShareStats);

module.exports = router;
