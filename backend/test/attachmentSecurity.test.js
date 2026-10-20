const assert = require('node:assert/strict');
const test = require('node:test');

const { safeFileName, trustedTrelloAttachmentUrl } = require('../utils/attachmentSecurity');

test('attachment filenames cannot preserve traversal or response-header injection', () => {
  assert.equal(safeFileName('../../etc/passwd'), 'passwd');
  assert.equal(safeFileName('..\\..\\Windows\\win.ini'), 'win.ini');
  assert.equal(safeFileName('.env'), 'env');
  assert.equal(safeFileName('CON'), '_CON');
  assert.equal(safeFileName('Résumé 2026.pdf'), 'Résumé 2026.pdf');
  assert.equal(safeFileName('"\r\nX-Injected: yes.txt'), 'X-Injected_ yes.txt');
  assert.equal(safeFileName(''), 'attachment');
  assert.equal(safeFileName('a'.repeat(300)).length, 180);
});

test('owner Trello credentials can only be sent to trusted HTTPS attachment origins', () => {
  assert.equal(
    trustedTrelloAttachmentUrl('https://trello.com/1/cards/card/attachments/file/download/report.pdf'),
    'https://trello.com/1/cards/card/attachments/file/download/report.pdf'
  );
  assert.equal(
    trustedTrelloAttachmentUrl('https://api.trello.com/1/cards/card/attachments/file'),
    'https://api.trello.com/1/cards/card/attachments/file'
  );
  for (const value of [
    'http://trello.com/file',
    'https://trello.com.evil.example/file',
    'https://evil.example/file',
    'https://user@trello.com/file',
    'file:///etc/passwd',
    'not a url'
  ]) {
    assert.throws(() => trustedTrelloAttachmentUrl(value), /invalid|not trusted/);
  }
});
