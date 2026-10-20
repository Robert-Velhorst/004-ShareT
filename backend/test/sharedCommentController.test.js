const test = require('node:test');
const assert = require('node:assert/strict');

const { __test } = require('../controllers/sharedCommentController');

function mockResponse(data, { ok = true, status = 200, statusText = 'OK' } = {}) {
  return {
    ok,
    status,
    statusText,
    json: async () => data
  };
}

async function withMockFetch(responses, assertion) {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || 'GET' });
    const response = responses.shift();
    assert.ok(response, `Unexpected Trello request: ${url}`);
    return response;
  };

  try {
    await assertion(calls);
  } finally {
    global.fetch = originalFetch;
  }
}

test('shared relay labels the freelancer and directly mentions the owner', () => {
  const result = __test.formatComment({
    text: 'The worker dashboard is ready.',
    authorName: '  Kamal\nUddin  ',
    notifyUsername: 'noodzakelijkonline',
    nativeAuthor: false
  });

  assert.equal(
    result,
    '**Kamal Uddin**: The worker dashboard is ready.\n\n@noodzakelijkonline'
  );
});

test('per-share relay relies on its native Trello author row', () => {
  const result = __test.formatComment({
    text: 'The worker dashboard is ready.',
    authorName: 'Kamal Uddin',
    notifyUsername: '@owner',
    nativeAuthor: true
  });

  assert.equal(result, 'The worker dashboard is ready.\n\n@owner');
});

test('token candidates prefer the per-share identity and remove duplicates', () => {
  const oldBotToken = process.env.TRELLO_BOT_TOKEN;
  process.env.TRELLO_BOT_TOKEN = 'shared-token';

  try {
    const candidates = __test.buildTokenCandidates(
      { guestTrelloToken: 'freelancer-token' },
      { trelloToken: 'shared-token' }
    );

    assert.deepEqual(candidates.map(candidate => candidate.label), [
      'freelancer-relay',
      'shared-relay'
    ]);
    assert.ok(candidates.every(candidate => candidate.autoAssignToCard));
  } finally {
    if (oldBotToken === undefined) delete process.env.TRELLO_BOT_TOKEN;
    else process.env.TRELLO_BOT_TOKEN = oldBotToken;
  }
});

test('owner fallback reports that Trello will suppress the self-notification', () => {
  const result = __test.assessTrelloNotification({
    comment: { memberCreator: { id: 'owner-id', username: 'owner' } },
    candidate: { label: 'owner-fallback' },
    connection: { trelloMemberId: 'owner-id', trelloUsername: 'owner' },
    notifyUsername: 'owner'
  });

  assert.equal(result.bellExpected, false);
  assert.match(result.warning, /does not notify/i);
});

test('a distinct relay mention reports normal Trello bell delivery', () => {
  const result = __test.assessTrelloNotification({
    comment: { memberCreator: { id: 'relay-id', username: 'sharet-updates' } },
    candidate: { label: 'shared-relay' },
    connection: { trelloMemberId: 'owner-id', trelloUsername: 'owner' },
    notifyUsername: 'owner'
  });

  assert.deepEqual(result, { bellExpected: true, warning: null });
});

test('relay membership check leaves an already-assigned bot unchanged', { concurrency: false }, async () => {
  await withMockFetch([
    mockResponse({ id: 'bot-id', username: 'sharet', fullName: 'ShareT' }),
    mockResponse({ idMembers: ['owner-id', 'bot-id'] })
  ], async (calls) => {
    const result = await __test.ensureRelayAssignedToCard({
      cardId: 'card-id',
      key: 'api-key',
      token: 'bot-token'
    });

    assert.equal(calls.length, 2);
    assert.match(calls[0].url, /\/members\/me\?/);
    assert.match(calls[1].url, /\/cards\/card-id\?/);
    assert.deepEqual(result, {
      member: { id: 'bot-id', username: 'sharet', fullName: 'ShareT' },
      assigned: true,
      added: false,
      alreadyAssigned: true
    });
  });
});

test('relay is automatically added when it is missing from the card', { concurrency: false }, async () => {
  await withMockFetch([
    mockResponse({ id: 'bot-id', username: 'sharet', fullName: 'ShareT' }),
    mockResponse({ idMembers: ['owner-id'] }),
    mockResponse({ id: 'card-id', idMembers: ['owner-id', 'bot-id'] })
  ], async (calls) => {
    const result = await __test.ensureRelayAssignedToCard({
      cardId: 'card-id',
      key: 'api-key',
      token: 'bot-token'
    });

    assert.equal(calls.length, 3);
    assert.equal(calls[2].method, 'POST');
    const assignmentUrl = new URL(calls[2].url);
    assert.equal(assignmentUrl.pathname, '/1/cards/card-id/idMembers');
    assert.equal(assignmentUrl.searchParams.get('value'), 'bot-id');
    assert.equal(result.added, true);
    assert.equal(result.alreadyAssigned, false);
  });
});

test('relay assignment failure is explicit when the bot lacks board access', { concurrency: false }, async () => {
  await withMockFetch([
    mockResponse({ id: 'bot-id', username: 'sharet', fullName: 'ShareT' }),
    mockResponse({ idMembers: ['owner-id'] }),
    mockResponse(
      { message: 'member is not on the board' },
      { ok: false, status: 400, statusText: 'Bad Request' }
    )
  ], async () => {
    await assert.rejects(
      __test.ensureRelayAssignedToCard({
        cardId: 'card-id',
        key: 'api-key',
        token: 'bot-token'
      }),
      /relay card assignment failed \(400\): member is not on the board/
    );
  });
});

test('the owner is subscribed to the card so the bell does not depend on a mention', { concurrency: false }, async () => {
  await withMockFetch([
    mockResponse({ id: 'card-id', subscribed: true })
  ], async (calls) => {
    const result = await __test.ensureOwnerSubscribedToCard({
      cardId: 'watch-me',
      key: 'api-key',
      token: 'owner-token',
      force: true
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'PUT');
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, '/1/cards/watch-me/subscribed');
    assert.equal(url.searchParams.get('value'), 'true');
    assert.equal(url.searchParams.get('token'), 'owner-token');
    assert.deepEqual(result, { subscribed: true, cached: false });
  });
});

test('a failed subscription is reported but never throws, so the comment still posts', { concurrency: false }, async () => {
  await withMockFetch([
    mockResponse({ message: 'invalid token' }, { ok: false, status: 401, statusText: 'Unauthorized' })
  ], async () => {
    const result = await __test.ensureOwnerSubscribedToCard({
      cardId: 'unwatchable',
      key: 'api-key',
      token: 'bad-token',
      force: true
    });

    assert.equal(result.subscribed, false);
    assert.equal(result.reason, 'subscription-failed');
    assert.equal(result.reason, 'subscription-failed');
    assert.equal('error' in result, false);
  });
});

test('auto-watch can be disabled without touching Trello', { concurrency: false }, async () => {
  const previous = process.env.SHARET_AUTO_WATCH_CARDS;
  process.env.SHARET_AUTO_WATCH_CARDS = 'false';

  try {
    await withMockFetch([], async (calls) => {
      const result = await __test.ensureOwnerSubscribedToCard({
        cardId: 'card-id',
        key: 'api-key',
        token: 'owner-token',
        force: true
      });

      assert.equal(calls.length, 0);
      assert.deepEqual(result, { subscribed: false, reason: 'auto-watch-disabled' });
    });
  } finally {
    if (previous === undefined) delete process.env.SHARET_AUTO_WATCH_CARDS;
    else process.env.SHARET_AUTO_WATCH_CARDS = previous;
  }
});

test('a watched card still expects the bell when no mention username is configured', () => {
  const result = __test.assessTrelloNotification({
    comment: { memberCreator: { id: 'relay-id', username: 'sharet-updates' } },
    candidate: { label: 'shared-relay' },
    connection: { trelloMemberId: 'owner-id', trelloUsername: 'owner' },
    notifyUsername: '',
    subscription: { subscribed: true }
  });

  assert.equal(result.bellExpected, true);
  assert.match(result.warning, /watching this card/i);
});

test('no mention and no subscription means no bell', () => {
  const result = __test.assessTrelloNotification({
    comment: { memberCreator: { id: 'relay-id', username: 'sharet-updates' } },
    candidate: { label: 'shared-relay' },
    connection: { trelloMemberId: 'owner-id', trelloUsername: 'owner' },
    notifyUsername: '',
    subscription: { subscribed: false }
  });

  assert.equal(result.bellExpected, false);
});

test('the owner posting for themselves is never rescued by a subscription', () => {
  const result = __test.assessTrelloNotification({
    comment: { memberCreator: { id: 'owner-id', username: 'owner' } },
    candidate: { label: 'owner-fallback' },
    connection: { trelloMemberId: 'owner-id', trelloUsername: 'owner' },
    notifyUsername: 'owner',
    subscription: { subscribed: true }
  });

  assert.equal(result.bellExpected, false);
  assert.match(result.warning, /does not notify/i);
});
