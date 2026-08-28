import path from 'path';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

function resolveDbPath(dbPath) {
  // Default relative to service root.
  const effective = dbPath || process.env.DB_PATH || 'data/ArweaveAnalytics.sqlite';
  return path.resolve(effective);
}

export function utcDateStringFromMs(timestampMs) {
  return new Date(timestampMs).toISOString().split('T')[0];
}

export async function openDb({ dbPath } = {}) {
  const filename = resolveDbPath(dbPath);
  const db = await open({
    filename,
    driver: sqlite3.Database
  });

  const busyTimeoutMs = Math.max(0, parseInt(process.env.SQLITE_BUSY_TIMEOUT_MS || '5000', 10) || 5000);
  await db.exec('PRAGMA journal_mode = WAL;');
  await db.exec('PRAGMA synchronous = NORMAL;');
  await db.exec('PRAGMA foreign_keys = ON;');
  await db.exec(`PRAGMA busy_timeout = ${busyTimeoutMs};`);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS bundles (
      txid TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      height INTEGER NOT NULL,
      timestamp_ms INTEGER NOT NULL,
      item_count INTEGER NOT NULL DEFAULT 0,
      computed_at_ms INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_bundles_timestamp ON bundles(timestamp_ms);
    CREATE INDEX IF NOT EXISTS idx_bundles_source_timestamp ON bundles(source, timestamp_ms);
    CREATE INDEX IF NOT EXISTS idx_bundles_height ON bundles(height);

    CREATE TABLE IF NOT EXISTS source_state (
      source TEXT PRIMARY KEY,
      last_indexed_height INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS metadata (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Ensure rows exist for known sources
  for (const source of ['redstone', 'ardrive', 'ario', 'kyve']) {
    await db.run(
      'INSERT OR IGNORE INTO source_state(source, last_indexed_height) VALUES (?, 0)',
      source
    );
  }

  await db.run('INSERT OR IGNORE INTO metadata(key, value) VALUES (?, ?)', 'last_update', null);

  return db;
}
