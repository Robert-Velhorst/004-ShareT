const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { ApiToken, databases, initDatabases } = require('../db/pouchdb');

test('connector credentials are hashed, scoped, expiring, and revocable', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sharet-token-test-'));
  try {
    await initDatabases(dataDirectory);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const { credential, document } = await ApiToken.create({
      userId: 'owner-1',
      name: 'HAI',
      scopes: ['connector:read'],
      expiresAt
    });

    assert.match(credential, /^sharet_pat_/);
    assert.equal(document.tokenHash.includes(credential), false);
    const stored = await databases.api_tokens.get(document._id);
    assert.equal('credential' in stored, false);
    assert.equal(stored.tokenHash.length, 64);

    const authenticated = await ApiToken.findByCredential(credential);
    assert.equal(authenticated.userId, 'owner-1');
    assert.deepEqual(authenticated.scopes, ['connector:read']);
    assert.equal(await ApiToken.findByCredential(`${credential}broken`), null);

    assert.equal(await ApiToken.revoke('someone-else', document.tokenId), false);
    assert.equal(await ApiToken.revoke('owner-1', document.tokenId), true);
    assert.equal(await ApiToken.findByCredential(credential), null);
  } finally {
    await Promise.all(Object.values(databases).map(database => database.destroy()));
    fs.rmSync(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
