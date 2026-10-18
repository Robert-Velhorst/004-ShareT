'use strict';

/**
 * Accept only Trello's own download URL for the exact uploaded attachment.
 * Trello link attachments can contain arbitrary URLs, so never fetch one while
 * sending the owner's Trello credentials.
 */
function getSafeTrelloAttachmentUrl(attachment, cardId, attachmentId) {
  if (!attachment || attachment.isUpload !== true) return null;
  if (String(attachment.id) !== String(attachmentId)) return null;
  if (typeof cardId !== 'string' || typeof attachmentId !== 'string') return null;
  if (!cardId || !attachmentId || !attachment.url) return null;

  let url;
  try {
    url = new URL(attachment.url);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:' || url.hostname !== 'trello.com') return null;
  if (url.port || url.username || url.password || url.search || url.hash) return null;

  const prefix = `/1/cards/${encodeURIComponent(cardId)}/attachments/${encodeURIComponent(attachmentId)}/download/`;
  if (!url.pathname.startsWith(prefix)) return null;

  const filename = url.pathname.slice(prefix.length);
  if (!filename || filename.includes('/')) return null;

  let decodedFilename;
  try {
    decodedFilename = decodeURIComponent(filename);
  } catch {
    return null;
  }
  if (!decodedFilename || decodedFilename === '.' || decodedFilename === '..' || /[\\/]/.test(decodedFilename)) return null;

  return url.toString();
}

module.exports = { getSafeTrelloAttachmentUrl };
