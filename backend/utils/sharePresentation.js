function presentSharedLink(link) {
  if (!link) return null;
  const {
    password: _password,
    guestTrelloToken: _guestTrelloToken,
    guestTrelloTokenEncrypted: _guestTrelloTokenEncrypted,
    ...safe
  } = link;
  return {
    ...safe,
    hasPassword: Boolean(link.password),
    hasGuestRelay: Boolean(link.guestTrelloToken || link.guestTrelloTokenEncrypted)
  };
}

module.exports = { presentSharedLink };
