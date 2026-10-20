/**
 * Authentication Controller
 * Handles user registration, login, logout, and profile management
 * Uses PouchDB for platform-agnostic data storage
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const validator = require('validator');
const { ApiToken, User } = require('../db/pouchdb');
const { presentUser } = require('../utils/userPresentation');
const { deleteAccountData, exportAccountData } = require('../services/accountDataService');

function createMailTransporter() {
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true' || process.env.EMAIL_SECURE === 'true',
    auth: user && pass ? { user, pass } : undefined
  });
}

const isDevelopment = () => process.env.NODE_ENV === 'development';
const validPassword = value => typeof value === 'string' && value.length >= 8 && value.length <= 128;

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET || 'sharet-jwt-secret-change-in-production',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Generate refresh token
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET || 'sharet-refresh-secret-change-in-production',
    { expiresIn: '30d' }
  );
};

const cookieOptions = (maxAge) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge
});

function setAuthCookies(res, token, refreshToken) {
  res.cookie('sharet_access', token, cookieOptions(7 * 24 * 60 * 60 * 1000));
  res.cookie('sharet_refresh', refreshToken, cookieOptions(30 * 24 * 60 * 60 * 1000));
}

function clearAuthCookies(res) {
  const options = cookieOptions(0);
  delete options.maxAge;
  res.clearCookie('sharet_access', options);
  res.clearCookie('sharet_refresh', options);
}

function readCookie(req, name) {
  const pair = (req.headers.cookie || '')
    .split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

/**
 * Register a new user
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    if (!validator.isEmail(String(email)) || !validPassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'Enter a valid email address and a password between 8 and 128 characters'
      });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'This account already exists. Please log in or reset your password.'
      });
    }

    // Create user
    const user = await User.create({
      email,
      password,
      name: name || email.split('@')[0]
    });

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    setAuthCookies(res, token, refreshToken);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      ...(req.get('X-ShareT-Token-Response') === 'true' ? { token, refreshToken } : {}),
      user: presentUser(user)
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering user'
    });
  }
};

/**
 * Login user
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check password
    const isMatch = await User.comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    setAuthCookies(res, token, refreshToken);

    res.json({
      success: true,
      message: 'Login successful',
      ...(req.get('X-ShareT-Token-Response') === 'true' ? { token, refreshToken } : {}),
      user: presentUser(user)
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging in'
    });
  }
};

/**
 * Logout user
 * POST /api/auth/logout
 */
exports.logout = async (req, res) => {
  try {
    clearAuthCookies(res);
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging out'
    });
  }
};

/**
 * Get current user
 * GET /api/auth/me
 */
exports.getCurrentUser = async (req, res) => {
  try {
    const user = await User.findByIdLean(req.user._id || req.user.id);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      user: presentUser(user)
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user'
    });
  }
};

/**
 * Update user profile
 * PUT /api/auth/profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    const updates = {};

    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) {
        return res.status(400).json({
          success: false,
          message: 'Name cannot be empty'
        });
      }
      updates.name = trimmedName;
    }
    if (email) {
      if (!validator.isEmail(String(email))) {
        return res.status(400).json({ success: false, message: 'Enter a valid email address' });
      }
      // Check if email is already taken
      const existingUser = await User.findByEmail(email);
      if (existingUser && existingUser._id !== (req.user._id || req.user.id)) {
        return res.status(400).json({
          success: false,
          message: 'Email is already taken'
        });
      }
      updates.email = email.toLowerCase();
    }

    const user = await User.updateById(req.user._id || req.user.id, updates);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: presentUser(user)
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile'
    });
  }
};

/**
 * Change password
 * PUT /api/auth/password
 */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (!validPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message: 'New password must be between 8 and 128 characters'
      });
    }

    // Get user with password
    const user = await User.findById(req.user._id || req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isMatch = await User.comparePassword(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await User.updateById(req.user._id || req.user.id, { password: hashedPassword });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Error changing password'
    });
  }
};

/**
 * Refresh token
 * POST /api/auth/refresh
 */
exports.refreshToken = async (req, res) => {
  try {
    const refreshToken = readCookie(req, 'sharet_refresh') || req.body.refreshToken;
    if (!refreshToken) return res.status(401).json({ success: false, message: 'Refresh session is missing' });

    // Verify refresh token
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || 'sharet-refresh-secret-change-in-production'
    );

    // Check if user exists
    const user = await User.findByIdLean(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // Generate new tokens
    const newToken = generateToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);
    setAuthCookies(res, newToken, newRefreshToken);

    res.json({
      success: true
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid refresh token'
    });
  }
};

/**
 * Forgot password - send reset email
 * POST /api/auth/forgot-password
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !validator.isEmail(String(email))) {
      return res.status(400).json({ success: false, message: 'A valid email is required' });
    }

    const user = await User.findByEmail(email);
    if (!user) {
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    await User.updateById(user._id, {
      passwordResetToken: hashedToken,
      passwordResetExpires: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });

    const frontendUrl = process.env.PUBLIC_URL || process.env.FRONTEND_URL || 'http://localhost:5005';
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

    if (isDevelopment()) {
      console.log(`[ShareT development] Password reset requested for ${user.email}`);
    }

    const emailUser = process.env.SMTP_USER || process.env.EMAIL_USER;
    const emailPassword = process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;
    if (!emailUser || !emailPassword) {
      if (!isDevelopment()) {
        return res.json({
          success: true,
          message: 'If that email exists and delivery is configured, a reset link has been sent'
        });
      }
      return res.json({
        success: true,
        message: 'Development mode: email is not configured. Use the reset link below.',
        resetUrl
      });
    }

    try {
      const transporter = createMailTransporter();
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.EMAIL_FROM || 'ShareT <noreply@sharet.app>',
        to: user.email,
        subject: 'Password Reset Request - ShareT',
        html: `<p>You requested a password reset.</p>
               <p>Click the link below to reset your password (valid for 10 minutes):</p>
               <a href="${resetUrl}">${resetUrl}</a>
               <p>If you did not request this, ignore this email.</p>`
      });
      res.json({ success: true, message: 'Password reset link sent to your email.' });
    } catch (emailError) {
      console.error('Email send failed:', emailError.message);
      if (isDevelopment()) {
        return res.json({
          success: true,
          message: 'Development mode: email delivery failed. Use the reset link below.',
          resetUrl
        });
      }
      res.json({
        success: true,
        message: 'If that email exists and delivery is configured, a reset link has been sent'
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Error processing password reset' });
  }
};

/**
 * Reset password with token
 * POST /api/auth/reset-password/:token
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }
    if (!validPassword(password)) {
      return res.status(400).json({
        success: false,
        message: 'New password must be between 8 and 128 characters'
      });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findByResetToken(hashedToken);

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await User.updateById(user._id, {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null
    });

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Error resetting password' });
  }
};

exports.getCredits = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const billing = require('../billing/runtime').getBilling();
    if (billing.config.enabled) {
      const wallet = billing.summary(userId);
      return res.json({ success: true, credits: wallet.canUse ? wallet.credits : 0, creditType: 'resource' });
    }
    const credits = await User.getCredits(userId);
    res.json({ success: true, credits, creditType: 'share-allowance' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching credits' });
  }
};

/**
 * Probe the browser cookie without turning the normal signed-out state into a
 * failed network request. Protected account APIs continue to return 401.
 */
exports.getSession = async (req, res) => {
  try {
    if (!req.user) {
      return res.json({ success: true, authenticated: false, user: null });
    }
    const user = await User.findByIdLean(req.user._id || req.user.id);
    if (!user) {
      return res.json({ success: true, authenticated: false, user: null });
    }
    return res.json({ success: true, authenticated: true, user: presentUser(user) });
  } catch (error) {
    console.error('Session probe error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching session' });
  }
};

const CONNECTOR_SCOPES = new Set(['connector:read', 'shares:write']);

exports.listApiTokens = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const tokens = await ApiToken.listByUserId(userId);
    res.json({ success: true, data: tokens });
  } catch (error) {
    console.error('API token list error:', error);
    res.status(500).json({ success: false, message: 'Unable to list connector tokens' });
  }
};

exports.createApiToken = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    const existing = await ApiToken.listByUserId(userId);
    if (existing.length >= 10) {
      return res.status(409).json({ success: false, message: 'Revoke an existing connector token before creating another' });
    }
    const name = String(req.body.name || '').trim().slice(0, 80);
    if (!name) return res.status(400).json({ success: false, message: 'Connector name is required' });
    const requestedScopes = Array.isArray(req.body.scopes) ? req.body.scopes : ['connector:read'];
    const scopes = [...new Set(requestedScopes.map(String))];
    if (!scopes.length || scopes.some(scope => !CONNECTOR_SCOPES.has(scope))) {
      return res.status(400).json({ success: false, message: 'Connector scopes are invalid' });
    }
    const requestedDays = Number(req.body.expiresInDays || 90);
    const expiresInDays = Math.max(1, Math.min(365, Number.isFinite(requestedDays) ? requestedDays : 90));
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const { credential, document } = await ApiToken.create({ userId, name, scopes, expiresAt });
    const { tokenHash: _tokenHash, ...safe } = document;
    res.status(201).json({
      success: true,
      token: credential,
      data: safe,
      message: 'Copy this token now. ShareT will not show it again.'
    });
  } catch (error) {
    console.error('API token creation error:', error);
    res.status(500).json({ success: false, message: 'Unable to create connector token' });
  }
};

exports.revokeApiToken = async (req, res) => {
  try {
    const revoked = await ApiToken.revoke(req.user._id || req.user.id, req.params.tokenId);
    if (!revoked) return res.status(404).json({ success: false, message: 'Connector token not found' });
    res.json({ success: true, message: 'Connector token revoked' });
  } catch (error) {
    console.error('API token revocation error:', error);
    res.status(500).json({ success: false, message: 'Unable to revoke connector token' });
  }
};

exports.exportAccount = async (req, res) => {
  try {
    const data = await exportAccountData(req.user._id || req.user.id);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="sharet-account-${date}.json"`);
    res.json(data);
  } catch (error) {
    console.error('Account export error:', error);
    res.status(500).json({ success: false, message: 'Unable to export account data' });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const password = String(req.body.password || '');
    const user = await User.findById(req.user._id || req.user.id);
    if (!password || !user || !(await User.comparePassword(password, user.password))) {
      return res.status(401).json({ success: false, message: 'Current password is required' });
    }
    const result = await deleteAccountData(user._id);
    clearAuthCookies(res);
    res.json({ success: true, message: 'Account and owned ShareT data deleted', ...result });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ success: false, message: 'Unable to delete account data' });
  }
};
