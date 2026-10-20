const test = require('node:test');
const assert = require('node:assert/strict');

const { redactSecrets } = require('../services/accountDataService');
const { presentSharedLink } = require('../utils/sharePresentation');

test('share responses never expose password or Trello relay credentials', () => {
  const presented = presentSharedLink({
    shareId: 'share-1',
    password: 'bcrypt-hash',
    guestTrelloToken: 'plain-token',
    guestTrelloTokenEncrypted: 'encrypted-token'
  });

  assert.equal(presented.shareId, 'share-1');
  assert.equal(presented.hasPassword, true);
  assert.equal(presented.hasGuestRelay, true);
  assert.equal('password' in presented, false);
  assert.equal('guestTrelloToken' in presented, false);
  assert.equal('guestTrelloTokenEncrypted' in presented, false);
});

test('account exports recursively remove credentials and internal ids', () => {
  const exported = redactSecrets({
    _id: 'internal',
    email: 'freelancer@example.com',
    accessToken: 'secret',
    nested: { passwordHash: 'hash', useful: true }
  });

  assert.deepEqual(exported, {
    email: 'freelancer@example.com',
    nested: { useful: true }
  });
});
