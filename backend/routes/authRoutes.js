/**
 * Authentication Routes
 * Handles user registration, login, logout, and profile management
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { optionalAuth, protect } = require('../middleware/auth');
const { standardApiRateLimit, apiRateLimit, authRateLimit } = require('../utils/rateLimiter');

// Public routes
router.post('/register', standardApiRateLimit, apiRateLimit, authRateLimit, authController.register);
router.post('/login', standardApiRateLimit, apiRateLimit, authRateLimit, authController.login);
router.post('/logout', standardApiRateLimit, apiRateLimit, authController.logout);
router.get('/session', standardApiRateLimit, apiRateLimit, optionalAuth, authController.getSession);

// Protected routes (require authentication)
router.get('/me', standardApiRateLimit, apiRateLimit, protect, authController.getCurrentUser);
router.get('/export', standardApiRateLimit, apiRateLimit, protect, authController.exportAccount);
router.delete('/account', standardApiRateLimit, apiRateLimit, protect, authController.deleteAccount);
router.put('/profile', standardApiRateLimit, apiRateLimit, protect, authController.updateProfile);
router.put('/password', standardApiRateLimit, apiRateLimit, protect, authController.changePassword);
router.get('/api-tokens', standardApiRateLimit, apiRateLimit, protect, authController.listApiTokens);
router.post('/api-tokens', standardApiRateLimit, apiRateLimit, protect, authController.createApiToken);
router.delete('/api-tokens/:tokenId', standardApiRateLimit, apiRateLimit, protect, authController.revokeApiToken);

// Token refresh
router.post('/refresh-token', standardApiRateLimit, apiRateLimit, authRateLimit, authController.refreshToken);

// Password reset
router.post('/forgot-password', standardApiRateLimit, apiRateLimit, authRateLimit, authController.forgotPassword);
router.post('/reset-password/:token', standardApiRateLimit, apiRateLimit, authRateLimit, authController.resetPassword);

// Credits
router.get('/credits', standardApiRateLimit, apiRateLimit, protect, authController.getCredits);

module.exports = router;
