const assert = require('node:assert/strict');
const test = require('node:test');
const { encodeTrelloPathSegment } = require('../utils/trelloPath');

test('Trello path segments accept card ids and short links', () => {
  assert.equal(encodeTrelloPathSegment('0123456789abcdef01234567'), '0123456789abcdef01234567');
  assert.equal(encodeTrelloPathSegment('AbCd1234'), 'AbCd1234');
});

test('Trello path segments reject path syntax and malformed identifiers', () => {
  for (const value of ['../members/me', 'card/attachments', '%2fadmin', 'short', 12345678, null]) {
    assert.equal(encodeTrelloPathSegment(value), null);
  }
});
