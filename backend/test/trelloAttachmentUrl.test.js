'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { getSafeTrelloAttachmentUrl } = require('../utils/trelloAttachmentUrl');

const cardId = '5fc7d887b4bc7b1039678af6';
const attachmentId = '602a8501ecff9a3942b922ec';
const validAttachment = {
  id: attachmentId,
  isUpload: true,
  url: `https://trello.com/1/cards/${cardId}/attachments/${attachmentId}/download/report.png`
};

test('accepts Trello download URLs for the exact uploaded attachment', () => {
  assert.equal(getSafeTrelloAttachmentUrl(validAttachment, cardId, attachmentId), validAttachment.url);
});

test('rejects external link attachments, including HTTPS URLs', () => {
  assert.equal(getSafeTrelloAttachmentUrl({ ...validAttachment, isUpload: false, url: 'https://attacker.example/file' }, cardId, attachmentId), null);
});

test('rejects a URL on another host even when it is marked as an upload', () => {
  assert.equal(getSafeTrelloAttachmentUrl({ ...validAttachment, url: 'https://trello.com.attacker.example/file' }, cardId, attachmentId), null);
});

test('rejects URLs for another card or attachment', () => {
  const otherAttachmentUrl = `https://trello.com/1/cards/${cardId}/attachments/aaaaaaaaaaaaaaaaaaaaaaaa/download/report.png`;
  assert.equal(getSafeTrelloAttachmentUrl({ ...validAttachment, url: otherAttachmentUrl }, cardId, attachmentId), null);
});

test('rejects redirects encoded into a filename path, credentials, query, or fragment', () => {
  const cases = [
    `https://trello.com/1/cards/${cardId}/attachments/${attachmentId}/download/%2e%2e%2fmembers`,
    `https://user:pass@trello.com/1/cards/${cardId}/attachments/${attachmentId}/download/report.png`,
    `${validAttachment.url}?redirect=https://attacker.example`,
    `${validAttachment.url}#https://attacker.example`
  ];
  for (const url of cases) {
    assert.equal(getSafeTrelloAttachmentUrl({ ...validAttachment, url }, cardId, attachmentId), null);
  }
});
