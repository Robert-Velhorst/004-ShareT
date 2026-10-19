/**
 * Authentication Routes
 * Handles user registration, login, logout, and profile management
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { optionalAuth, protect } = require('../middleware/auth');
const { apiRateLimit, authRateLimit } = require('../utils/rateLimiter');

// Public routes
router.post('/register', apiRateLimit, authRateLimit, authController.register);
router.post('/login', apiRateLimit, authRateLimit, authController.login);
router.post('/logout', apiRateLimit, authController.logout);
router.get('/session', apiRateLimit, optionalAuth, authController.getSession);

// Protected routes (require authentication)
router.get('/me', apiRateLimit, protect, authController.getCurrentUser);
router.get('/export', apiRateLimit, protect, authController.exportAccount);
router.delete('/account', apiRateLimit, protect, authController.deleteAccount);
router.put('/profile', apiRateLimit, protect, authController.updateProfile);
router.put('/password', apiRateLimit, protect, authController.changePassword);
router.get('/api-tokens', apiRateLimit, protect, authController.listApiTokens);
router.post('/api-tokens', apiRateLimit, protect, authController.createApiToken);
router.delete('/api-tokens/:tokenId', apiRateLimit, protect, authController.revokeApiToken);

// Token refresh
router.post('/refresh-token', apiRateLimit, authRateLimit, authController.refreshToken);

// Password reset
router.post('/forgot-password', apiRateLimit, authRateLimit, authController.forgotPassword);
router.post('/reset-password/:token', apiRateLimit, authRateLimit, authController.resetPassword);

// Credits
router.get('/credits', apiRateLimit, protect, authController.getCredits);

module.exports = router;
