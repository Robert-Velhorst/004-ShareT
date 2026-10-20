/**
 * Authentication Middleware
 * Uses PouchDB for platform-agnostic data storage
 */

const jwt = require('jsonwebtoken');
const { ApiToken, User } = require('../db/pouchdb');

function readCookie(req, name) {
  const pair = (req.headers.cookie || '')
    .split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : null;
}

function readAccessToken(req) {
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return req.headers.authorization.slice(7);
  }
  return readCookie(req, 'sharet_access');
}

exports.protect = async (req, res, next) => {
  try {
    const token = readAccessToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'sharet-jwt-secret-change-in-production');

    // Get user from PouchDB
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route'
    });
  }
};

exports.adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
};

exports.connectorProtect = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer sharet_pat_')) {
      return res.status(401).json({ success: false, message: 'A ShareT connector token is required' });
    }
    const apiToken = await ApiToken.findByCredential(authorization.slice(7));
    if (!apiToken) {
      return res.status(401).json({ success: false, message: 'Connector token is invalid or expired' });
    }
    const user = await User.findById(apiToken.userId);
    if (!user?.isActive) {
      return res.status(401).json({ success: false, message: 'Connector account is unavailable' });
    }
    req.user = user;
    req.connectorToken = apiToken;
    try {
      await ApiToken.touch(apiToken);
    } catch (touchError) {
      console.warn('Unable to update connector token usage metadata:', touchError.message);
    }
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Connector authentication failed' });
  }
};

exports.requireConnectorScope = scope => (req, res, next) => {
  if (!req.connectorToken?.scopes?.includes(scope)) {
    return res.status(403).json({ success: false, message: `Connector scope required: ${scope}` });
  }
  next();
};

// Optional auth - doesn't fail if no token
exports.optionalAuth = async (req, res, next) => {
  try {
    const token = readAccessToken(req);

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'sharet-jwt-secret-change-in-production');
      const user = await User.findById(decoded.id);
      if (user) {
        req.user = user;
      }
    }

    next();
  } catch (error) {
    next();
  }
};
