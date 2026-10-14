/**
 * Trello Routes
 * Handles Trello OAuth and API interactions
 */

const express = require('express');
const router = express.Router();
const trelloController = require('../controllers/trelloController');
const { protect } = require('../middleware/auth');
const { owner: requireResourceBalance } = require('../billing/access');

// OAuth routes
router.get('/auth-url', protect, trelloController.getAuthUrl);
router.get('/callback', trelloController.handleCallback);
router.post('/connect', protect, trelloController.connect);
router.post('/disconnect', protect, trelloController.disconnect);

// Status & connections
router.get('/status', protect, trelloController.getStatus);
router.get('/connections', protect, trelloController.getConnections);
router.get('/notification-health', protect, trelloController.getNotificationHealth);

// Boards
router.use(['/boards', '/cards'], protect, requireResourceBalance);
router.get('/boards', protect, trelloController.getBoards);
router.get('/boards/:boardId', protect, trelloController.getBoard);
router.get('/boards/:boardId/cards', protect, trelloController.getBoardCards);
router.get('/boards/:boardId/lists', protect, trelloController.getBoardLists);

// Cards
router.get('/cards/:cardId', protect, trelloController.getCard);
router.get('/cards/:cardId/attachments', protect, trelloController.getCardAttachments);
router.get('/cards/:cardId/comments', protect, trelloController.getCardComments);
router.get('/cards/:cardId/actions', protect, trelloController.getCardActions);
router.get('/cards/:cardId/checklists', protect, trelloController.getCardChecklists);
router.get('/cards/:cardId/members', protect, trelloController.getCardMembers);
router.get('/cards/:cardId/links', protect, trelloController.getCardLinks);
router.get('/cards/:cardId/plugin-data', protect, trelloController.getCardPluginData);

// Card actions (for shared access)
router.post('/cards/:cardId/comments', protect, trelloController.addComment);
router.put('/cards/:cardId/due', protect, trelloController.setDueDate);

module.exports = router;
