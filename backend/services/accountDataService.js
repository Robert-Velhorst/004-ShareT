const { databases, User } = require('../db/pouchdb');
const { presentUser } = require('../utils/userPresentation');
const { presentSharedLink } = require('../utils/sharePresentation');

const REDACTED_KEY = /(password|token|secret|verificationCode|resetPassword)/i;

function redactSecrets(value) {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith('_') && !REDACTED_KEY.test(key))
      .map(([key, nested]) => [key, redactSecrets(nested)])
  );
}

async function allDocuments(databaseName) {
  const result = await databases[databaseName].allDocs({ include_docs: true });
  return result.rows.map(row => row.doc).filter(Boolean);
}

async function accountScope(userId) {
  const shares = (await allDocuments('shared_links')).filter(document => document.userId === userId);
  const shareIds = new Set(shares.map(share => share.shareId));
  return { shares, shareIds };
}

function belongsToScope(document, userId, shareIds) {
  return document.userId === userId
    || shareIds.has(document.shareId);
}

async function exportAccountData(userId) {
  const user = await User.findByIdLean(userId);
  if (!user) throw new Error('User not found');
  const { shares, shareIds } = await accountScope(userId);
  const collectionNames = Object.keys(databases).filter(name => !['users', 'shared_links'].includes(name));
  const collections = {};

  for (const name of collectionNames) {
    const documents = await allDocuments(name);
    collections[name] = redactSecrets(documents.filter(document => belongsToScope(document, userId, shareIds)));
  }

  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    account: presentUser(user),
    sharedLinks: shares.map(link => redactSecrets(presentSharedLink(link))),
    collections
  };
}

async function deleteAccountData(userId) {
  const { shareIds } = await accountScope(userId);
  let deleted = 0;

  for (const [name, database] of Object.entries(databases)) {
    const documents = await allDocuments(name);
    const owned = documents.filter(document => (
      (name === 'users' && document._id === userId)
      || belongsToScope(document, userId, shareIds)
    ));
    if (owned.length) {
      await database.bulkDocs(owned.map(document => ({ ...document, _deleted: true })));
      deleted += owned.length;
    }
  }

  return { deletedDocuments: deleted };
}

module.exports = { deleteAccountData, exportAccountData, redactSecrets };
