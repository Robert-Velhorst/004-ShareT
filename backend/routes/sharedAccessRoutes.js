/**
 * Shared Access Routes
 * Handles public access to shared cards (no auth required)
 */

const express = require('express');
const router = express.Router();
const sharedAccessController = require('../controllers/sharedAccessController');
const sharedCommentController = require('../controllers/sharedCommentController');
const { standardSharedRateLimit, sharedLinkRateLimit, verificationRateLimit } = require('../utils/rateLimiter');

const { guest: requireOwnerBalance } = require('../billing/access');
// All guest work is funded by the link owner, never by the freelancer.


// Public routes - no authentication required
router.get('/:shareId', standardSharedRateLimit, sharedLinkRateLimit, requireOwnerBalance, sharedAccessController.getSharedCard);
router.post('/:shareId/verify-email', standardSharedRateLimit, sharedLinkRateLimit, requireOwnerBalance, verificationRateLimit, sharedAccessController.requestVerification);
router.post('/:shareId/confirm-verification', standardSharedRateLimit, sharedLinkRateLimit, requireOwnerBalance, sharedAccessController.confirmVerification);
router.post('/:shareId/participant-status', standardSharedRateLimit, sharedLinkRateLimit, requireOwnerBalance, sharedAccessController.getParticipantStatus);
router.post('/:shareId/verify-password', standardSharedRateLimit, sharedLinkRateLimit, requireOwnerBalance, sharedAccessController.verifyPassword);

// Attachments
router.get('/:shareId/attachments', standardSharedRateLimit, sharedLinkRateLimit, requireOwnerBalance, sharedAccessController.getAttachments);
router.get('/:shareId/attachments/:attachmentId/download', standardSharedRateLimit, sharedLinkRateLimit, requireOwnerBalance, sharedAccessController.downloadAttachment);
router.post('/:shareId/attachments', standardSharedRateLimit, sharedLinkRateLimit, requireOwnerBalance, sharedAccessController.uploadAttachment);

// Comments & Actions — Fix #12, #13
router.get('/:shareId/comments', standardSharedRateLimit, sharedLinkRateLimit, requireOwnerBalance, sharedAccessController.getSharedComments);
router.get('/:shareId/actions', standardSharedRateLimit, sharedLinkRateLimit, requireOwnerBalance, sharedAccessController.getSharedActions);
router.post('/:shareId/comments', standardSharedRateLimit, sharedLinkRateLimit, requireOwnerBalance, sharedCommentController.addComment);

// Checklists — Fix #7
router.get('/:shareId/checklists', standardSharedRateLimit, sharedLinkRateLimit, requireOwnerBalance, sharedAccessController.getSharedChecklists);

// Members — Fix #10
router.get('/:shareId/members', standardSharedRateLimit, sharedLinkRateLimit, requireOwnerBalance, sharedAccessController.getSharedMembers);

// Links — Fix #14
router.get('/:shareId/links', standardSharedRateLimit, sharedLinkRateLimit, requireOwnerBalance, sharedAccessController.getSharedLinks);

// Due date
router.put('/:shareId/due-date', standardSharedRateLimit, sharedLinkRateLimit, requireOwnerBalance, sharedAccessController.setDueDate);

module.exports = router;
