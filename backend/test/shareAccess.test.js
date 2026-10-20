const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initDatabases, databases, SharedLink, ShareParticipant } = require('../db/pouchdb');
const {
  authorizeShareRequest,
  signPasswordGrant,
  verifyPasswordGrant
} = require('../utils/shareAccess');

function requestWith(headers = {}) {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value])
  );
  return {
    body: {},
    get(name) {
      return normalized[name.toLowerCase()] || '';
    }
  };
}

test('restricted share content requires every configured access factor', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'share-access-test-secret-with-safe-length';
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sharet-access-test-'));

  try {
    await initDatabases(dataDirectory);
    const share = await SharedLink.create({
      userId: 'owner-1',
      cardId: 'card-1',
      cardName: 'Restricted card',
      allowedEmails: ['allowed@example.com'],
      password: 'correct horse battery staple',
      permissions: { canView: true, canComment: true }
    });
    const participant = await ShareParticipant.createVerified({
      shareId: share.shareId,
      email: 'allowed@example.com',
      name: 'Allowed Person'
    });

    const missingPassword = await authorizeShareRequest(requestWith(), share);
    assert.equal(missingPassword.code, 'PASSWORD_REQUIRED');

    const passwordToken = signPasswordGrant(share.shareId);
    assert.equal(verifyPasswordGrant(share.shareId, passwordToken), true);
    assert.equal(verifyPasswordGrant('different-share', passwordToken), false);

    const missingEmail = await authorizeShareRequest(requestWith({
      'x-sharet-password-token': passwordToken
    }), share);
    assert.equal(missingEmail.code, 'EMAIL_VERIFICATION_REQUIRED');

    const allowed = await authorizeShareRequest(requestWith({
      'x-sharet-password-token': passwordToken,
      'x-sharet-participant-token': participant.accessToken
    }), share);
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.participant.email, 'allowed@example.com');
  } finally {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    await Promise.all(Object.values(databases).map(database => database.destroy()));
    fs.rmSync(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
