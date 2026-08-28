import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Storage, logDiagnostic } from './db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCK_FILE = path.join(__dirname, 'logs', 'cron.lock');
let lockFd = null;
let storage = null;

// Ensure logs directory exists
try {
  fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
} catch (e) {
  // Directory already exists
}

// ============================================================================
// File-Based Locking
// ============================================================================

function acquireLock() {
  try {
    // Try to open the lock file with exclusive flag (fails if already locked)
    lockFd = fs.openSync(LOCK_FILE, 'wx');
    fs.writeFileSync(LOCK_FILE, String(process.pid));
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') {
      // Lock file exists, check if process is still alive
      try {
        const data = fs.readFileSync(LOCK_FILE, 'utf8');
        const pid = parseInt(data, 10);
        // Check if process with this PID exists
        try {
          process.kill(pid, 0);
          return false; // Process exists, lock is valid
        } catch {
          // Process doesn't exist, stale lock - remove it
          console.warn('[Lock] Removing stale lock file');
          fs.unlinkSync(LOCK_FILE);
          return acquireLock();
        }
      } catch (readError) {
        console.error('[Lock] Error reading lock file:', readError);
        return false;
      }
    }
    throw error;
  }
}

function releaseLock() {
  if (lockFd !== null) {
    try {
      fs.closeSync(lockFd);
      fs.unlinkSync(LOCK_FILE);
      lockFd = null;
    } catch (error) {
      console.error('[Lock] Failed to release lock:', error);
    }
  }
}

// ============================================================================
// Block Height Fetching
// ============================================================================

async function getCurrentBlockHeight() {
  const gateway = process.env.ARWEAVE_GATEWAY || 'https://arweave.net';
  let retries = 3;

  while (retries > 0) {
    try {
      const response = await fetch(`${gateway}/info`, {
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (typeof data.height !== 'number') {
        throw new Error(`Invalid response format: ${JSON.stringify(data)}`);
      }

      // Use the higher of 'height' or 'blocks' to handle edge cases
      const blockHeight = Math.max(data.height, data.blocks || 0);

      // Use current time as timestamp (when we checked)
      // Note: data.current is the block indep_hash, not a timestamp
      return {
        height: blockHeight,
        timestamp: Date.now()
      };
    } catch (error) {
      retries--;
      if (retries === 0) {
        logDiagnostic(`[Error] Failed to fetch block height after 3 retries: ${error.message}`);
        throw error;
      }
      logDiagnostic(`[Warning] Fetch failed, retrying... (${retries} left): ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
    }
  }
}

// ============================================================================
// Midnight Detection & Daily Block Recording
// ============================================================================

function getCurrentUTCHour() {
  const now = new Date();
  return now.toISOString().slice(0, 13) + ':00:00'; // YYYY-MM-DD HH:00:00
}

function getCurrentUTCDate() {
  const now = new Date();
  return now.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function shouldRecordDailyBlock() {
  const currentDateUTC = getCurrentUTCDate();
  const lastDailyBlock = await storage.getLastDailyBlock();

  // If no daily blocks exist yet, don't record (wait for historical data migration)
  if (!lastDailyBlock) {
    return { should: false };
  }

  // If last recorded date is before current date, we've crossed midnight
  // Record for TODAY (the day that's starting)
  if (lastDailyBlock.date < currentDateUTC) {
    return { should: true, targetDate: currentDateUTC };
  }

  // Same day - don't record yet
  return { should: false };
}

// ============================================================================
// Backup System
// ============================================================================

async function backupDatabase() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const backupFilename = `BlockHeights-${timestamp}.sqlite`;
    const backupDir = path.join(__dirname, 'backups');
    const backupPath = path.join(backupDir, backupFilename);

    // Ensure backups directory exists
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Get source database path
    const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'BlockHeights.sqlite');

    // Copy database file
    fs.copyFileSync(dbPath, backupPath);

    logDiagnostic(`[Backup] Database backed up to ${backupFilename}`);

    // Cleanup old backups (keep count from env or default to 24)
    const retentionCount = parseInt(process.env.BACKUP_RETENTION_COUNT || '24', 10);
    await cleanupOldBackups(retentionCount);
  } catch (error) {
    logDiagnostic(`[Backup Error] Failed to backup database: ${error.message}`);
  }
}

async function cleanupOldBackups(keepCount = 24) {
  try {
    const backupsDir = path.join(__dirname, 'backups');

    if (!fs.existsSync(backupsDir)) {
      return;
    }

    const files = fs.readdirSync(backupsDir);
    const backupFiles = files
      .filter(f => f.startsWith('BlockHeights-') && f.endsWith('.sqlite'))
      .sort()
      .reverse();

    // Delete backups beyond keepCount
    for (let i = keepCount; i < backupFiles.length; i++) {
      const filePath = path.join(backupsDir, backupFiles[i]);
      fs.unlinkSync(filePath);
      logDiagnostic(`[Backup] Deleted old backup: ${backupFiles[i]}`);
    }
  } catch (error) {
    logDiagnostic(`[Backup Error] Failed to cleanup old backups: ${error.message}`);
  }
}

// ============================================================================
// Main Processing Function
// ============================================================================

async function recordBlockHeight() {
  // Try to acquire lock
  if (!acquireLock()) {
    logDiagnostic('[Job] Already running, skipping');
    return;
  }

  try {
    logDiagnostic('[Job] Starting...');

    // Initialize storage if needed
    if (!storage) {
      storage = await Storage.init();
    }

    // Get current UTC hour
    const currentHour = getCurrentUTCHour();
    logDiagnostic(`[Job] Current UTC hour: ${currentHour}`);

    // Only act at midnight
    if (currentHour.endsWith('T00:00:00')) {
      logDiagnostic('[Job] It\'s midnight!');

      // Check if we should record (haven't already recorded for yesterday)
      const { should, targetDate } = await shouldRecordDailyBlock();

      if (should) {
        // Fetch current block height RIGHT NOW
        const blockInfo = await getCurrentBlockHeight();
        logDiagnostic(`[Job] Fetched current block height: ${blockInfo.height}`);

        // Record it for today (the day that's starting)
        await storage.addDailyBlock(targetDate, blockInfo.height, blockInfo.timestamp);
        logDiagnostic(`[Job] ✓ Recorded daily block: ${targetDate} -> height ${blockInfo.height}`);

        // Backup after recording
        await backupDatabase();
      } else {
        logDiagnostic('[Job] Already recorded for this date, skipping');
      }
    } else {
      logDiagnostic('[Job] Not midnight, nothing to do');
    }

    logDiagnostic('[Job] Completed successfully');
  } catch (error) {
    logDiagnostic(`[Job Error] ${error.message}`);
    logDiagnostic(`[Job Error] Stack: ${error.stack}`);
    throw error;
  } finally {
    releaseLock();
  }
}

// ============================================================================
// Express API Server
// ============================================================================

const app = express();

// CORS Configuration
const allowedOriginPatterns = [
  /^https?:\/\/(.*\.)?eye-of-ao/,        // Production: eye-of-ao.* domains
  /^https?:\/\/(.*\.)?dev-eye-of-ao/     // Dev: dev-eye-of-ao.* domains
];

// Add localhost pattern if ALLOW_LOCALHOST is enabled
if (process.env.ALLOW_LOCALHOST === 'true') {
  allowedOriginPatterns.push(/^http:\/\/localhost(:\d+)?$/);
  console.log('[CORS] Localhost access enabled');
}

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    const isAllowed = allowedOriginPatterns.some(pattern => pattern.test(origin));

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.send('Arweave Blockheight Tracker is running');
});

app.get('/health', async (req, res) => {
  try {
    if (!storage) {
      storage = await Storage.init();
    }

    const metadata = await storage.getMetadata();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      metadata
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get daily block heights
app.get('/api/blockheights/daily', async (req, res) => {
  try {
    if (!storage) {
      storage = await Storage.init();
    }

    // Use DEFAULT_QUERY_DAYS from env (default to 730 = 2 years)
    const defaultDays = parseInt(process.env.DEFAULT_QUERY_DAYS || '730', 10);
    const requestedDays = parseInt(req.query.days) || defaultDays;

    // Cap at maximum of 3650 days (10 years)
    const days = Math.min(Math.max(requestedDays, 1), 3650);
    const data = await storage.getDailyBlocks(days);

    const metadata = {
      days_requested: days,
      records_returned: data.length,
      latest_date: data.length > 0 ? data[0].date : null
    };

    res.json({
      success: true,
      data,
      metadata
    });
  } catch (error) {
    logDiagnostic(`[API Error] /api/blockheights/daily: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get latest daily block
app.get('/api/blockheights/latest', async (req, res) => {
  try {
    if (!storage) {
      storage = await Storage.init();
    }

    const data = await storage.getLastDailyBlock();

    if (!data) {
      return res.status(404).json({
        success: false,
        error: 'No daily blocks recorded yet'
      });
    }

    res.json({
      success: true,
      data
    });
  } catch (error) {
    logDiagnostic(`[API Error] /api/blockheights/latest: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================================
// Startup & Process Management
// ============================================================================

const port = process.env.API_PORT || 3001;
const isCronMode = process.argv.includes('--cron');

// Signal handlers for cleanup
process.on('SIGINT', () => {
  console.log('\n[Shutdown] Received SIGINT, cleaning up...');
  releaseLock();
  if (storage) {
    storage.close().then(() => process.exit(0));
  } else {
    process.exit(0);
  }
});

process.on('SIGTERM', () => {
  console.log('\n[Shutdown] Received SIGTERM, cleaning up...');
  releaseLock();
  if (storage) {
    storage.close().then(() => process.exit(0));
  } else {
    process.exit(0);
  }
});

if (isCronMode) {
  // Cron mode: just run the job and exit
  console.log('[Cron] Starting block height recording...');
  recordBlockHeight()
    .then(() => {
      console.log('[Cron] Job completed successfully');
      if (storage) {
        return storage.close();
      }
    })
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Cron] Job failed:', error);
      if (storage) {
        storage.close().then(() => process.exit(1));
      } else {
        process.exit(1);
      }
    });
} else {
  // Server mode: start HTTP server and optionally run initial check
  app.listen(port, () => {
    console.log(`[Server] Listening on port ${port}`);
    console.log(`[Server] Health check: http://localhost:${port}/health`);

    // Run initial block height recording
    console.log('[Server] Running initial block height check...');
    recordBlockHeight().catch((error) => {
      console.error('[Server] Initial check failed:', error);
    });
  });
}

export { recordBlockHeight };
