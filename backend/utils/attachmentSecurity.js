const TRUSTED_TRELLO_ATTACHMENT_HOSTS = new Set(['trello.com', 'api.trello.com']);

function safeFileName(value) {
  const leaf = String(value || 'attachment')
    .normalize('NFKC')
    .replace(/\\/g, '/')
    .split('/')
    .pop();
  const withoutControls = Array.from(leaf, character => {
    const codePoint = character.codePointAt(0);
    return codePoint < 32 || codePoint === 127 ? '_' : character;
  }).join('');
  let cleaned = withoutControls
    .replace(/["<>:|?*]+/g, '_')
    .replace(/^[._ -]+/, '')
    .trim()
    .slice(0, 180);
  if (!cleaned) cleaned = 'attachment';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(cleaned)) cleaned = `_${cleaned}`;
  return cleaned;
}

function trustedTrelloAttachmentUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch {
    throw new Error('Trello attachment URL is invalid');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    !TRUSTED_TRELLO_ATTACHMENT_HOSTS.has(parsed.hostname.toLowerCase())
  ) {
    throw new Error('Trello attachment URL is not trusted');
  }
  return parsed.href;
}

module.exports = { safeFileName, trustedTrelloAttachmentUrl };
