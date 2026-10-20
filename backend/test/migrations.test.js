const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const PouchDB = require('pouchdb');

process.env.ENCRYPTION_KEY = 'migration-test-encryption-key-0123456789';

const {
  databases,
  getMigrationState,
  initDatabases,
  SharedLink,
  TrelloConnection
} = require('../db/pouchdb');
const { CURRENT_DATA_SCHEMA_VERSION, DATA_SCHEMA_MARKER_ID } = require('../db/migrations');

async function seedDatabase(dataDirectory, name, documents) {
  const database = new PouchDB(path.join(dataDirectory, name));
  await database.bulkDocs(documents);
  await database.close();
}

async function destroyTestDatabases(dataDirectory) {
  await Promise.all(Object.values(databases).map(database => database.destroy()));
  fs.rmSync(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}

test('startup migration encrypts every legacy Trello credential and records its version', async t => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sharet-migration-'));
  t.after(async () => {
    await destroyTestDatabases(dataDirectory);
  });

  await seedDatabase(dataDirectory, 'trello_connections', [{
    _id: 'legacy-owner-token',
    type: 'trello_connection',
    userId: 'owner-1',
    trelloToken: 'legacy-owner-secret'
  }]);
  await seedDatabase(dataDirectory, 'shared_links', [{
    _id: 'legacy-relay-token',
    type: 'shared_link',
    userId: 'owner-1',
    shareId: 'legacy-share',
    guestTrelloToken: 'legacy-relay-secret'
  }]);

  await initDatabases(dataDirectory);

  const rawOwner = await databases.trello_connections.get('legacy-owner-token');
  assert.equal(rawOwner.trelloToken, undefined);
  assert.ok(rawOwner.trelloTokenEncrypted);
  const materializedOwner = await TrelloConnection.findByUserId('owner-1');
  assert.equal(materializedOwner.trelloToken, 'legacy-owner-secret');

  const rawShare = await databases.shared_links.get('legacy-relay-token');
  assert.equal(rawShare.guestTrelloToken, undefined);
  assert.ok(rawShare.guestTrelloTokenEncrypted);
  const materializedShare = await SharedLink.findByShareId('legacy-share');
  assert.equal(materializedShare.guestTrelloToken, 'legacy-relay-secret');

  const marker = await databases.users.get(DATA_SCHEMA_MARKER_ID);
  assert.equal(marker.version, CURRENT_DATA_SCHEMA_VERSION);
  assert.deepEqual(marker.history[0].result, {
    migratedOwnerTokens: 1,
    migratedRelayTokens: 1
  });
  assert.equal(getMigrationState().version, CURRENT_DATA_SCHEMA_VERSION);
  assert.equal(getMigrationState().currentVersion, CURRENT_DATA_SCHEMA_VERSION);
});

test('startup refuses data written by a newer ShareT schema', async t => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sharet-future-schema-'));
  t.after(async () => {
    await destroyTestDatabases(dataDirectory);
  });

  await seedDatabase(dataDirectory, 'users', [{
    _id: DATA_SCHEMA_MARKER_ID,
    version: CURRENT_DATA_SCHEMA_VERSION + 1,
    history: []
  }]);

  await assert.rejects(
    initDatabases(dataDirectory),
    /newer than supported schema/
  );
  await assert.rejects(
    databases.users.get('_local/sharet-index-schema'),
    error => error?.status === 404
  );
});
