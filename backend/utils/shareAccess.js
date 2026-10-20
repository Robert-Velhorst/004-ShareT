const jwt = require('jsonwebtoken');
const { ShareParticipant } = require('../db/pouchdb');

const PASSWORD_GRANT_SCOPE = 'sharet:share-password';

function accessSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required for ShareT access grants');
  }
  return secret;
}

function signPasswordGrant(shareId) {
  return jwt.sign(
    { shareId, scope: PASSWORD_GRANT_SCOPE },
    accessSecret(),
    { expiresIn: process.env.SHARET_PASSWORD_SESSION_TTL || '12h' }
  );
}

function verifyPasswordGrant(shareId, token) {
  if (!token) return false;
  try {
    const decoded = jwt.verify(token, accessSecret());
    return decoded.scope === PASSWORD_GRANT_SCOPE && decoded.shareId === shareId;
  } catch {
    return false;
  }
}

function requestAccessTokens(req) {
  return {
    participantToken: req.get?.('x-sharet-participant-token') || req.body?.participantToken || '',
    passwordToken: req.get?.('x-sharet-password-token') || req.body?.passwordToken || ''
  };
}

function shareRequiresIdentity(share, { requireIdentity = false } = {}) {
  return requireIdentity || Boolean(share.allowedEmails?.length);
}

async function authorizeShareRequest(req, share, options = {}) {
  const { participantToken, passwordToken } = requestAccessTokens(req);

  if (share.password && !verifyPasswordGrant(share.shareId, passwordToken)) {
    return {
      allowed: false,
      status: 401,
      code: 'PASSWORD_REQUIRED',
      message: 'Password verification is required'
    };
  }

  if (!shareRequiresIdentity(share, options)) {
    return { allowed: true, participant: null };
  }

  const participant = await ShareParticipant.findByAccessToken(share.shareId, participantToken);
  if (!participant) {
    return {
      allowed: false,
      status: 401,
      code: 'EMAIL_VERIFICATION_REQUIRED',
      message: 'Email verification is required'
    };
  }

  const allowedEmails = (share.allowedEmails || []).map(email => String(email).trim().toLowerCase());
  if (allowedEmails.length && !allowedEmails.includes(participant.email)) {
    return {
      allowed: false,
      status: 403,
      code: 'EMAIL_NOT_ALLOWED',
      message: 'This email address is not allowed to access the share'
    };
  }

  return { allowed: true, participant };
}

module.exports = {
  authorizeShareRequest,
  requestAccessTokens,
  shareRequiresIdentity,
  signPasswordGrant,
  verifyPasswordGrant
};
