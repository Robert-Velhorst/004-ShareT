const TRELLO_ID_PATTERN = /^[A-Za-z0-9]{8,32}$/;

function encodeTrelloPathSegment(value) {
  if (typeof value !== 'string' || !TRELLO_ID_PATTERN.test(value)) return null;
  return encodeURIComponent(value);
}

function validateTrelloPathParam(_req, res, next, value) {
  if (!encodeTrelloPathSegment(value)) {
    return res.status(400).json({ success: false, message: 'Invalid Trello resource identifier' });
  }
  return next();
}

module.exports = { encodeTrelloPathSegment, validateTrelloPathParam };
