const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');

process.env.ENCRYPTION_KEY = 'cross-user-test-encryption-key-0123456789';
process.env.JWT_SECRET = 'cross-user-test-jwt-secret-0123456789';

const { databases, initDatabases, SharedLink, User } = require('../db/pouchdb');
const sharedLinkRoutes = require('../routes/sharedLinkRoutes');

function listen(application) {
  return new Promise((resolve, reject) => {
    const server = application.listen(0, '127.0.0.1', () => resolve(server));
    server.once('error', reject);
  });
}

function close(server) {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('authenticated HTTP share routes conceal and protect other owners records', async t => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sharet-http-isolation-'));
  const application = express();
  application.use(express.json());
  application.use('/api/shared-links', sharedLinkRoutes);
  let server;
  t.after(async () => {
    if (server) await close(server);
    await Promise.all(Object.values(databases).map(database => database.destroy()));
    fs.rmSync(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  await initDatabases(dataDirectory);
  const alice = await User.create({ email: 'alice@example.test', password: 'correct-horse-battery-staple', name: 'Alice' });
  const bob = await User.create({ email: 'bob@example.test', password: 'correct-horse-battery-staple', name: 'Bob' });
  const aliceShare = await SharedLink.create({
    userId: alice._id,
    cardId: 'alice-card',
    cardName: 'Alice private card',
    permissions: { canView: true, canComment: false, canUpload: false, canDownload: true, canSetDueDate: false }
  });
  server = await listen(application);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const aliceToken = jwt.sign({ id: alice._id }, process.env.JWT_SECRET, { expiresIn: '5m' });
  const bobToken = jwt.sign({ id: bob._id }, process.env.JWT_SECRET, { expiresIn: '5m' });

  const request = (token, relative, options = {}) => fetch(`${origin}${relative}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const bobList = await request(bobToken, '/api/shared-links');
  assert.equal(bobList.status, 200);
  assert.deepEqual((await bobList.json()).data, []);

  for (const [method, suffix, body] of [
    ['GET', '', undefined],
    ['PUT', '', JSON.stringify({ isActive: false })],
    ['PATCH', '/toggle', undefined],
    ['GET', '/stats', undefined],
    ['DELETE', '', undefined]
  ]) {
    const response = await request(bobToken, `/api/shared-links/${aliceShare._id}${suffix}`, { method, body });
    assert.equal(response.status, 404, `${method} ${suffix || '/'} must conceal the foreign share`);
    assert.equal((await response.json()).message, 'Share not found');
  }

  const storedAfterAttacks = await SharedLink.findById(aliceShare._id);
  assert.equal(storedAfterAttacks.userId, alice._id);
  assert.equal(storedAfterAttacks.isActive, true);

  const ownerResponse = await request(aliceToken, `/api/shared-links/${aliceShare._id}`);
  assert.equal(ownerResponse.status, 200);
  assert.equal((await ownerResponse.json()).data.shareId, aliceShare.shareId);
});
