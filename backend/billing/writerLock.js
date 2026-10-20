const { DatabaseSync } = require('node:sqlite');

// An OS-backed SQLite lock is released even after a crash. It is separate from
// the ledger so normal short accounting transactions can still commit.
function acquireWriterLock(file) {
  const lock = new DatabaseSync(file);
  try { lock.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE'); return lock; }
  catch {
    lock.close();
    throw new Error('Another billing writer is already running for this DATA_DIR');
  }
}
module.exports = { acquireWriterLock };
