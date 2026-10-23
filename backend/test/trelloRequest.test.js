'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { fetchTrelloApi } = require('../utils/trelloRequest');
const { validateTrelloPathParam } = require('../utils/trelloPath');

test('API requests preserve method/body/headers and enforce redirect rejection', async t => {
  const calls = [];
  const response = { ok: true };
  t.mock.method(globalThis, 'fetch', async (...args) => { calls.push(args); return response; });
  const options = { method: 'POST', body: 'synthetic body', headers: { 'Content-Type': 'text/plain' }, redirect: 'follow' };
  assert.equal(await fetchTrelloApi('https://api.trello.com/1/cards/AbCd1234/actions/comments', options), response);
  assert.deepEqual(calls, [['https://api.trello.com/1/cards/AbCd1234/actions/comments', { ...options, redirect: 'error' }]]);
  assert.equal(options.redirect, 'follow', 'caller options are not mutated');
  const query = new URLSearchParams({ text: 'synthetic & scope=other / unicode \u20ac', token: 'synthetic+token' });
  await fetchTrelloApi(`https://api.trello.com/1/cards/AbCd1234/actions/comments?${query}`, options);
  const sent = new URL(calls[1][0]);
  assert.equal(sent.origin, 'https://api.trello.com');
  assert.equal(sent.pathname, '/1/cards/AbCd1234/actions/comments');
  assert.equal(sent.searchParams.get('text'), query.get('text'));
  assert.equal(sent.searchParams.get('token'), 'synthetic+token');
  assert.equal(sent.searchParams.has('scope'), false);
});

test('API requests reject other origins, credentials, fragments and non-API paths before fetch', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Unexpected request'); });
  for (const url of [
    'http://api.trello.com/1/cards/AbCd1234',
    'https://api.trello.com.attacker.invalid/1/cards/AbCd1234',
    'https://api.trello.com:444/1/cards/AbCd1234',
    'https://credential@api.trello.com/1/cards/AbCd1234',
    'https://api.trello.com/1/cards/AbCd1234#fragment',
    'https://api.trello.com/cards/AbCd1234',
    'https://api.trello.com/1/../../outside',
    'https://api.trello.com/1/cards/AbCd1234/../members',
    'https://api.trello.com/1/cards/%2e%2e/members',
    'https://api.trello.com/1/cards/AbCd1234%2Fother',
    'https://api.trello.com/1/cards/AbCd1234//actions',
    'https://api.trello.com/1/',
    '/1/cards/AbCd1234', null,
  ]) {
    await assert.rejects(fetchTrelloApi(url), { message: 'Invalid Trello API request' });
  }
  assert.equal(fetch.mock.calls.length, 0);
});

test('resource parameter middleware accepts supported identifiers and rejects URL syntax', () => {
  for (const value of ['0123456789abcdef01234567', 'AbCd1234']) {
    let next = 0;
    validateTrelloPathParam({}, { status: () => assert.fail('valid identifier rejected') }, () => { next += 1; }, value);
    assert.equal(next, 1);
  }
  for (const value of ['../members/me', 'AbCd1234?fields=all', 'AbCd1234#fragment', 'AbCd1234/other', '%2fadmin', '.', '..']) {
    let status, body;
    const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
    validateTrelloPathParam({}, res, () => assert.fail('invalid identifier admitted'), value);
    assert.equal(status, 400);
    assert.equal(body.success, false);
  }
});

const { SharedLink, TrelloConnection, AccessLog } = require('../db/pouchdb');
const controller = require('../controllers/sharedAccessController');
const cardId = '0123456789abcdef01234567';
const attachmentId = 'abcdef0123456789abcdef01';

function jsonResponse() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; } };
}

function shareFixture(t, overrides = {}) {
  return t.mock.method(SharedLink, 'findByShareId', async () => ({
    shareId: 'synthetic-share', userId: 'synthetic-owner', cardId, isActive: true,
    permissions: { canDownload: true }, ...overrides,
  }));
}

test('download rejects malformed attachment identifiers before storage or provider access', async t => {
  const shares = shareFixture(t);
  const fetch = t.mock.method(globalThis, 'fetch', async () => assert.fail('Unexpected provider request'));
  for (const value of ['invalid/id', 'invalid?query', 'invalid#fragment', '%2fencoded', 'short']) {
    const res = jsonResponse();
    await controller.downloadAttachment({ params: { shareId: 'synthetic-share', attachmentId: value } }, res);
    assert.equal(res.statusCode, 400);
  }
  assert.equal(shares.mock.calls.length, 0);
  assert.equal(fetch.mock.calls.length, 0);
});

test('download rejects unsupported stored card identity before credentials or provider access', async t => {
  shareFixture(t, { cardId: 'invalid/card' });
  const connections = t.mock.method(TrelloConnection, 'findByUserId', async () => assert.fail('Unexpected credential lookup'));
  const fetch = t.mock.method(globalThis, 'fetch', async () => assert.fail('Unexpected provider request'));
  const res = jsonResponse();
  await controller.downloadAttachment({ params: { shareId: 'synthetic-share', attachmentId } }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(connections.mock.calls.length, 0);
  assert.equal(fetch.mock.calls.length, 0);
});

test('download metadata preserves token query values and retains uploaded-file policy', async t => {
  shareFixture(t);
  t.mock.method(TrelloConnection, 'findByUserId', async () => ({ trelloToken: 'synthetic-token&scope=fixture' }));
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    const target = new URL(url);
    assert.equal(target.pathname, `/1/cards/${cardId}/attachments/${attachmentId}`);
    assert.equal(target.searchParams.get('token'), 'synthetic-token&scope=fixture');
    assert.equal(target.searchParams.has('scope'), false);
    assert.equal(options.redirect, 'error');
    return { ok: true, json: async () => ({ id: attachmentId, isUpload: false, url: 'https://example.invalid/file' }) };
  });
  const res = jsonResponse();
  await controller.downloadAttachment({ params: { shareId: 'synthetic-share', attachmentId } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(fetch.mock.calls.length, 1);
});

test('validated uploaded attachment still streams bytes with redirect rejection', async t => {
  const { Writable } = require('node:stream');
  const { finished } = require('node:stream/promises');
  shareFixture(t);
  t.mock.method(TrelloConnection, 'findByUserId', async () => ({ trelloToken: 'synthetic-token' }));
  t.mock.method(AccessLog, 'create', async () => ({}));
  const downloadUrl = `https://trello.com/1/cards/${cardId}/attachments/${attachmentId}/download/synthetic.txt`;
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.redirect, 'error');
    if (new URL(url).origin === 'https://api.trello.com') {
      return { ok: true, json: async () => ({ id: attachmentId, isUpload: true, url: downloadUrl, name: 'synthetic.txt' }) };
    }
    assert.equal(url, downloadUrl);
    return new Response('synthetic file bytes', { headers: { 'content-type': 'text/plain' } });
  });
  const chunks = [];
  const res = new Writable({ write(chunk, _encoding, callback) { chunks.push(chunk); callback(); } });
  res.setHeader = () => {};
  res.status = () => assert.fail('Valid download failed');
  const completion = finished(res);
  await controller.downloadAttachment({ params: { shareId: 'synthetic-share', attachmentId }, headers: {}, ip: '127.0.0.1' }, res);
  await completion;
  assert.equal(Buffer.concat(chunks).toString(), 'synthetic file bytes');
  assert.equal(fetch.mock.calls.length, 2);
});
