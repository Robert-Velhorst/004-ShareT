const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const PouchDB = require('pouchdb');

const { initDatabases, databases, Notification } = require('../db/pouchdb');

test('Notification Model: CRUD operations and unread counting', async () => {
  const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sharet-notif-test-'));

  try {
    // Cached schema 1 predates the notification database; upgrade its indexes.
    const existingUsers = new PouchDB(path.join(dataDirectory, 'users'));
    await existingUsers.put({ _id: '_local/sharet-index-schema', version: 1 });
    await existingUsers.close();
    await initDatabases(dataDirectory);
    const { indexes } = await databases.notifications.getIndexes();
    assert.ok(indexes.some(index => JSON.stringify(index.def.fields) === JSON.stringify([{ userId: 'asc' }, { createdAt: 'asc' }])));
    assert.ok(indexes.some(index => JSON.stringify(index.def.fields) === JSON.stringify([{ userId: 'asc' }, { isRead: 'asc' }])));

    const userId = 'user_test_notif_123';

    // 1. Create a notification
    const notif1 = await Notification.create({
      userId,
      type: 'comment',
      title: 'John Doe commented on Feature Card',
      message: 'I have finished the designs for review.',
      authorName: 'John Doe',
      authorEmail: 'john@example.com',
      shareId: 'share_abc_1',
      cardId: 'card_xyz_1',
      cardTitle: 'Feature Card',
      linkUrl: '/shared/share_abc_1/card'
    });

    assert.ok(notif1._id, 'Notification should have an _id');
    assert.equal(notif1.userId, userId);
    assert.equal(notif1.isRead, false);
    assert.equal(notif1.authorName, 'John Doe');
    assert.equal(notif1.cardTitle, 'Feature Card');
    assert.equal(notif1.linkUrl, '/shared/share_abc_1/card');

    // 2. Create a second notification
    const notif2 = await Notification.create({
      userId,
      type: 'comment',
      title: 'Jane Smith commented on Bugfix Card',
      message: 'Fixed the CSS alignment issue.',
      authorName: 'Jane Smith',
      authorEmail: 'jane@example.com',
      shareId: 'share_abc_2',
      cardId: 'card_xyz_2',
      cardTitle: 'Bugfix Card',
      linkUrl: '/shared/share_abc_2/card'
    });

    // 3. Count unread
    let unread = await Notification.countUnread(userId);
    assert.equal(unread, 2, 'Should have 2 unread notifications');

    // 4. Find notifications by userId
    const list = await Notification.findByUserId(userId);
    assert.equal(list.length, 2, 'Should return 2 notifications');

    // 5. Mark single notification as read
    const marked = await Notification.markAsRead(notif1._id, userId);
    assert.ok(marked);
    assert.equal(marked.isRead, true);

    unread = await Notification.countUnread(userId);
    assert.equal(unread, 1, 'Should have 1 unread notification after marking one read');

    // 6. Mark all as read
    const countMarked = await Notification.markAllAsRead(userId);
    assert.equal(countMarked, 1, 'Should mark the remaining unread notification');

    unread = await Notification.countUnread(userId);
    assert.equal(unread, 0, 'Unread count should be 0');

    // 7. Delete notification
    const deleted = await Notification.delete(notif2._id, userId);
    assert.equal(deleted, true);

    const remaining = await Notification.findByUserId(userId);
    assert.equal(remaining.length, 1, 'Should have 1 notification remaining after delete');
    assert.equal(remaining[0]._id, notif1._id);
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
