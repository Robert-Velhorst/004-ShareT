const DATA_SCHEMA_MARKER_ID = '_local/sharet-data-schema';
const CURRENT_DATA_SCHEMA_VERSION = 1;

async function loadMarker(database) {
  try {
    return await database.get(DATA_SCHEMA_MARKER_ID);
  } catch (error) {
    if (error.status === 404) {
      return {
        _id: DATA_SCHEMA_MARKER_ID,
        version: 0,
        history: []
      };
    }
    throw error;
  }
}

async function migrateDocuments(database, predicate, transform) {
  const rows = await database.allDocs({ include_docs: true });
  const candidates = rows.rows.map(row => row.doc).filter(document => document && predicate(document));
  if (!candidates.length) return 0;

  const responses = await database.bulkDocs(candidates.map(transform));
  const failure = responses.find(response => response && response.error);
  if (failure) {
    throw new Error(`data migration write failed: ${failure.name || failure.error}`);
  }
  return candidates.length;
}

const migrations = [
  {
    version: 1,
    name: 'encrypt-legacy-trello-credentials',
    async up({ databases, encryptSecret, now }) {
      const migratedOwnerTokens = await migrateDocuments(
        databases.trello_connections,
        document => Boolean(document.trelloToken && !document.trelloTokenEncrypted),
        document => {
          const migrated = {
            ...document,
            trelloTokenEncrypted: encryptSecret(document.trelloToken),
            updatedAt: now
          };
          delete migrated.trelloToken;
          return migrated;
        }
      );
      const migratedRelayTokens = await migrateDocuments(
        databases.shared_links,
        document => Boolean(document.guestTrelloToken && !document.guestTrelloTokenEncrypted),
        document => {
          const migrated = {
            ...document,
            guestTrelloTokenEncrypted: encryptSecret(document.guestTrelloToken),
            updatedAt: now
          };
          delete migrated.guestTrelloToken;
          return migrated;
        }
      );
      return { migratedOwnerTokens, migratedRelayTokens };
    }
  }
];

async function runMigrations(databases, { encryptSecret, now = () => new Date().toISOString() } = {}) {
  if (!databases?.users || typeof encryptSecret !== 'function') {
    throw new Error('data migration dependencies are unavailable');
  }

  let marker = await loadMarker(databases.users);
  const storedVersion = Number(marker.version || 0);
  if (!Number.isInteger(storedVersion) || storedVersion < 0) {
    throw new Error('invalid ShareT data schema marker');
  }
  if (storedVersion > CURRENT_DATA_SCHEMA_VERSION) {
    throw new Error(`ShareT data schema ${storedVersion} is newer than supported schema ${CURRENT_DATA_SCHEMA_VERSION}`);
  }

  for (const migration of migrations) {
    if (migration.version <= Number(marker.version || 0)) continue;
    if (migration.version !== Number(marker.version || 0) + 1) {
      throw new Error(`ShareT data migration sequence is incomplete at version ${migration.version}`);
    }

    const appliedAt = now();
    const result = await migration.up({ databases, encryptSecret, now: appliedAt });
    const nextMarker = {
      ...marker,
      version: migration.version,
      appliedAt,
      history: [
        ...(Array.isArray(marker.history) ? marker.history : []),
        { version: migration.version, name: migration.name, appliedAt, result }
      ]
    };
    const saved = await databases.users.put(nextMarker);
    marker = { ...nextMarker, _rev: saved.rev };
  }

  return {
    version: Number(marker.version || 0),
    currentVersion: CURRENT_DATA_SCHEMA_VERSION,
    appliedAt: marker.appliedAt || null,
    history: Array.isArray(marker.history) ? marker.history : []
  };
}

module.exports = {
  CURRENT_DATA_SCHEMA_VERSION,
  DATA_SCHEMA_MARKER_ID,
  runMigrations
};
