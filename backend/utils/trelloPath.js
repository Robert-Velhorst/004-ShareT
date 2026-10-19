const TRELLO_ID_PATTERN = /^[A-Za-z0-9]{8,32}$/;

function encodeTrelloPathSegment(value) {
  if (typeof value !== 'string' || !TRELLO_ID_PATTERN.test(value)) return null;
  return encodeURIComponent(value);
}

module.exports = { encodeTrelloPathSegment };
