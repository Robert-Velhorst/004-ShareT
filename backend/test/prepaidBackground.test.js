const { test } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/pouchdb');
const runtime = require('../billing/runtime');
const replies = require('../services/replyNotificationService');

test('background reply polling pauses a held wallet without spending or discarding pending work', async t => {
  const originalKey = process.env.TRELLO_API_KEY;
  process.env.TRELLO_API_KEY = 'test-key';
  t.after(() => { if (originalKey === undefined) delete process.env.TRELLO_API_KEY; else process.env.TRELLO_API_KEY = originalKey; });
  let providerCalls = 0;
  t.mock.method(runtime, 'getBilling', () => ({ config: { enabled: true }, summary: () => ({ canUse: false, held: true }) }));
  t.mock.method(db.ReplyEvent, 'findActionable', async () => []);
  t.mock.method(db.CommentThread, 'findAllPending', async () => [{ shareId: 's', cardId: 'c' }]);
  t.mock.method(db.CommentThread, 'findPendingByShareId', async () => []);
  t.mock.method(db.SharedLink, 'findByShareId', async () => ({ isActive: true, userId: 'owner', cardId: 'c', shareId: 's' }));
  t.mock.method(db.TrelloConnection, 'findByUserId', async () => ({ trelloToken: 'token', trelloMemberId: 'owner' }));
  t.mock.method(global, 'fetch', async () => { providerCalls++; return { ok: true, json: async () => [] }; });
  await replies.processPendingReplyNotifications();
  assert.equal(providerCalls, 0);
});
