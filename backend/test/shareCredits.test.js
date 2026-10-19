const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initDatabases, databases, User } = require('../db/pouchdb');
const shareController = require('../controllers/shareController');

async function createShare(user, cardId) {
  const req = {
    user,
    body: {
      cardId,
      cardName: `Card ${cardId}`,
      permissions: { canView: true, canComment: false }
    }
  };
  const result = { statusCode: 200, payload: null };
  const res = {
    status(statusCode) {
      result.statusCode = statusCode;
      return this;
    },
    json(payload) {
      result.payload = payload;
      return this;
    }
  };

  await shareController.createShare(req, res);
  return result;
}

test('share creation charges on the server while duplicate reuse stays free', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sharet-credit-test-'));

  try {
    await initDatabases(dataDirectory);
    const user = await User.create({
      email: 'credit-test@example.com',
      password: 'correct-horse-battery-staple',
      name: 'Credit Test'
    });

    for (let index = 1; index <= 3; index += 1) {
      const response = await createShare(user, `00000000000000000000000${index}`);
      assert.equal(response.statusCode, 201);
      assert.equal(response.payload.creditsRemaining, 3 - index);
    }

    const exhausted = await createShare(user, '000000000000000000000004');
    assert.equal(exhausted.statusCode, 402);
    assert.equal(exhausted.payload.message, 'Insufficient credits');

    const duplicate = await createShare(user, '000000000000000000000001');
    assert.equal(duplicate.statusCode, 200);
    assert.equal(duplicate.payload.duplicate, true);
    assert.equal(duplicate.payload.creditsRemaining, 0);
    assert.equal(await User.getCredits(user._id), 0);
  } finally {
    await Promise.all(Object.values(databases).map(database => database.destroy()));
    fs.rmSync(dataDirectory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100
    });
  }
});
