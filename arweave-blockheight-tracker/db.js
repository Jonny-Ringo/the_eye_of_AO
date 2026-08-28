import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Database schema
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS daily_blocks (
  date TEXT PRIMARY KEY,
  block_height INTEGER NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  recorded_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_date ON daily_blocks(date);
`;

// Diagnostic logger
const DIAG_LOG_FILE = path.join(__dirname, 'logs', 'diagnostics.log');

function logDiagnostic(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  console.log(message);
  try {
    fs.appendFileSync(DIAG_LOG_FILE, logLine);
  } catch (error) {
    // Silently fail if we can't write to log
  }
}

export class Storage {
  constructor(db) {
    this.db = db;
  }

  static async init() {
    const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'BlockHeights.sqlite');

    // Ensure data directory exists
    const dataDir = path.dirname(dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Configure SQLite for optimal performance and safety
    await db.exec(`PRAGMA journal_mode = WAL;`);
    await db.exec(`PRAGMA synchronous = NORMAL;`);
    await db.exec(`PRAGMA foreign_keys = ON;`);
    await db.exec(`PRAGMA busy_timeout = 5000;`);

    // Create tables
    await db.exec(SCHEMA_SQL);

    return new Storage(db);
  }

  async close() {
    await this.db.close();
  }

  // Add daily block
  async addDailyBlock(date, blockHeight, timestampMs) {
    await this.db.run(
      `INSERT INTO daily_blocks (date, block_height, timestamp_ms, recorded_at_ms)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         block_height = excluded.block_height,
         timestamp_ms = excluded.timestamp_ms,
         recorded_at_ms = excluded.recorded_at_ms`,
      [date, blockHeight, timestampMs, Date.now()]
    );
    logDiagnostic(`[DB] Recorded daily block: ${date} -> height ${blockHeight}`);
  }

  // Update existing daily block (CLI operation)
  async updateDailyBlock(date, newHeight) {
    const result = await this.db.run(
      `UPDATE daily_blocks SET block_height = ?, recorded_at_ms = ? WHERE date = ?`,
      [newHeight, Date.now(), date]
    );

    if (result.changes > 0) {
      logDiagnostic(`[CLI] Updated ${date} to height ${newHeight}`);
      return true;
    }
    return false;
  }

  // Delete daily block (CLI operation)
  async deleteDailyBlock(date) {
    const result = await this.db.run(
      `DELETE FROM daily_blocks WHERE date = ?`,
      [date]
    );

    if (result.changes > 0) {
      logDiagnostic(`[CLI] Deleted ${date}`);
      return true;
    }
    return false;
  }

  // Get last daily block
  async getLastDailyBlock() {
    return await this.db.get(
      `SELECT * FROM daily_blocks ORDER BY date DESC LIMIT 1`
    );
  }

  // Get daily block by specific date (CLI operation)
  async getDailyBlockByDate(date) {
    return await this.db.get(
      `SELECT * FROM daily_blocks WHERE date = ?`,
      [date]
    );
  }

  // Get daily blocks for the last N days
  async getDailyBlocks(days = 30) {
    return await this.db.all(
      `SELECT * FROM daily_blocks
       ORDER BY date DESC
       LIMIT ?`,
      [days]
    );
  }

  // Get all daily blocks
  async getAllDailyBlocks() {
    return await this.db.all(
      `SELECT * FROM daily_blocks ORDER BY date DESC`
    );
  }

  // Find date gaps in daily blocks
  async findDateGaps() {
    const rows = await this.db.all(
      `SELECT date FROM daily_blocks ORDER BY date ASC`
    );

    const gaps = [];
    for (let i = 1; i < rows.length; i++) {
      const prev = new Date(rows[i - 1].date);
      const curr = new Date(rows[i].date);
      const daysDiff = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

      if (daysDiff > 1) {
        gaps.push({
          after: rows[i - 1].date,
          before: rows[i].date,
          missing_days: daysDiff - 1
        });
      }
    }

    return gaps;
  }

  // Get metadata
  async getMetadata() {
    const lastBlock = await this.getLastDailyBlock();
    const totalRecords = await this.db.get(
      `SELECT COUNT(*) as count FROM daily_blocks`
    );

    return {
      lastRecordedDate: lastBlock?.date || null,
      totalDailyRecords: totalRecords.count,
      lastBlockHeight: lastBlock?.block_height || null,
      lastRecordedAt: lastBlock?.recorded_at_ms || null
    };
  }
}

export { logDiagnostic };
