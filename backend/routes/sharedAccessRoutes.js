/**
 * Shared Access Routes
 * Handles public access to shared cards (no auth required)
 */

const express = require('express');
const router = express.Router();
const sharedAccessController = require('../controllers/sharedAccessController');
const sharedCommentController = require('../controllers/sharedCommentController');
const { sharedLinkRateLimit, verificationRateLimit } = require('../utils/rateLimiter');

// Public routes - no authentication required
router.get('/:shareId', sharedLinkRateLimit, sharedAccessController.getSharedCard);
router.post('/:shareId/verify-email', sharedLinkRateLimit, verificationRateLimit, sharedAccessController.requestVerification);
router.post('/:shareId/confirm-verification', sharedLinkRateLimit, sharedAccessController.confirmVerification);
router.post('/:shareId/participant-status', sharedLinkRateLimit, sharedAccessController.getParticipantStatus);
router.post('/:shareId/verify-password', sharedLinkRateLimit, sharedAccessController.verifyPassword);

// Attachments
router.get('/:shareId/attachments', sharedLinkRateLimit, sharedAccessController.getAttachments);
router.get('/:shareId/attachments/:attachmentId/download', sharedLinkRateLimit, sharedAccessController.downloadAttachment);
router.post('/:shareId/attachments', sharedLinkRateLimit, sharedAccessController.uploadAttachment);

// Comments & Actions — Fix #12, #13
router.get('/:shareId/comments', sharedLinkRateLimit, sharedAccessController.getSharedComments);
router.get('/:shareId/actions', sharedLinkRateLimit, sharedAccessController.getSharedActions);
router.post('/:shareId/comments', sharedLinkRateLimit, sharedCommentController.addComment);

// Checklists — Fix #7
router.get('/:shareId/checklists', sharedLinkRateLimit, sharedAccessController.getSharedChecklists);

// Members — Fix #10
router.get('/:shareId/members', sharedLinkRateLimit, sharedAccessController.getSharedMembers);

// Links — Fix #14
router.get('/:shareId/links', sharedLinkRateLimit, sharedAccessController.getSharedLinks);

// Due date
router.put('/:shareId/due-date', sharedLinkRateLimit, sharedAccessController.setDueDate);

module.exports = router;
