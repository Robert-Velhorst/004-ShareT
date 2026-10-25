/**
 * Trello Routes
 * Handles Trello OAuth and API interactions
 */

const express = require('express');
const router = express.Router();
const trelloController = require('../controllers/trelloController');
const { protect } = require('../middleware/auth');
const { standardApiRateLimit } = require('../utils/rateLimiter');
const { owner: requireResourceBalance } = require('../billing/access');
const { validateTrelloPathParam } = require('../utils/trelloPath');

router.param('cardId', validateTrelloPathParam);
router.param('boardId', validateTrelloPathParam);

// OAuth routes
router.get('/auth-url', standardApiRateLimit, protect, trelloController.getAuthUrl);
router.get('/callback', standardApiRateLimit, trelloController.handleCallback);
router.get('/callback.js', standardApiRateLimit, trelloController.handleCallbackScript);
router.post('/connect', standardApiRateLimit, protect, trelloController.connect);
router.post('/disconnect', standardApiRateLimit, protect, trelloController.disconnect);

// Status & connections
router.get('/status', standardApiRateLimit, protect, trelloController.getStatus);
router.get('/connections', standardApiRateLimit, protect, trelloController.getConnections);
router.get('/notification-health', standardApiRateLimit, protect, trelloController.getNotificationHealth);

// Boards

router.get('/boards', standardApiRateLimit, protect, requireResourceBalance, trelloController.getBoards);
router.get('/boards/:boardId', standardApiRateLimit, protect, requireResourceBalance, trelloController.getBoard);
router.get('/boards/:boardId/cards', standardApiRateLimit, protect, requireResourceBalance, trelloController.getBoardCards);
router.get('/boards/:boardId/lists', standardApiRateLimit, protect, requireResourceBalance, trelloController.getBoardLists);

// Cards
router.get('/cards/:cardId', standardApiRateLimit, protect, requireResourceBalance, trelloController.getCard);
router.get('/cards/:cardId/attachments', standardApiRateLimit, protect, requireResourceBalance, trelloController.getCardAttachments);
router.get('/cards/:cardId/comments', standardApiRateLimit, protect, requireResourceBalance, trelloController.getCardComments);
router.get('/cards/:cardId/actions', standardApiRateLimit, protect, requireResourceBalance, trelloController.getCardActions);
router.get('/cards/:cardId/checklists', standardApiRateLimit, protect, requireResourceBalance, trelloController.getCardChecklists);
router.get('/cards/:cardId/members', standardApiRateLimit, protect, requireResourceBalance, trelloController.getCardMembers);
router.get('/cards/:cardId/links', standardApiRateLimit, protect, requireResourceBalance, trelloController.getCardLinks);

// Card actions (for shared access)
router.post('/cards/:cardId/comments', standardApiRateLimit, protect, requireResourceBalance, trelloController.addComment);
router.put('/cards/:cardId/due', standardApiRateLimit, protect, requireResourceBalance, trelloController.setDueDate);

module.exports = router;
