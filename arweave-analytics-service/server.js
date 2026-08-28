import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { openDb } from './db.js';

dotenv.config();

// ============================================================================
// Storage Manager (SQLite)
// ============================================================================

class Storage {
  constructor(db) {
    this.db = db;
  }

  async getMetadata() {
    const rows = await this.db.all('SELECT source, last_indexed_height FROM source_state');
    const last_indexed_height = { redstone: 0, ardrive: 0, ario: 0, kyve: 0 };
    for (const row of rows) {
      if (row?.source && typeof row?.last_indexed_height === 'number') {
        last_indexed_height[row.source] = row.last_indexed_height;
      }
    }
    const lastUpdateRow = await this.db.get('SELECT value FROM metadata WHERE key = ?', 'last_update');
    return {
      last_indexed_height,
      last_update: lastUpdateRow?.value ?? null
    };
  }

  async setLastIndexedHeight(source, height) {
    await this.db.run(
      'INSERT OR REPLACE INTO source_state(source, last_indexed_height) VALUES (?, ?)',
      source,
      height
    );
  }

  async setLastUpdate(isoString) {
    await this.db.run('INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)', 'last_update', isoString);
  }

  async hasBundles(txids) {
    if (!txids.length) return new Set();
    const placeholders = txids.map(() => '?').join(',');
    const rows = await this.db.all(
      `SELECT txid FROM bundles WHERE txid IN (${placeholders})`,
      ...txids
    );
    return new Set(rows.map(r => r.txid));
  }

  async addBundles(bundles) {
    if (!bundles.length) return 0;
    const stmt = await this.db.prepare(
      'INSERT OR IGNORE INTO bundles(txid, source, height, timestamp_ms, item_count, computed_at_ms) VALUES (?, ?, ?, ?, ?, ?)'
    );
    let inserted = 0;
    await this.db.exec('BEGIN;');
    try {
      for (const b of bundles) {
        const res = await stmt.run(
          b.txid,
          b.source,
          b.height,
          b.timestamp,
          b.item_count,
          b.computed_at
        );
        // sqlite driver returns changes
        if (res?.changes) inserted += res.changes;
      }
      await stmt.finalize();
      await this.db.exec('COMMIT;');
    } catch (e) {
      try { await this.db.exec('ROLLBACK;'); } catch {}
      try { await stmt.finalize(); } catch {}
      throw e;
    }
    return inserted;
  }

  async getDailyAggregates(days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    const cutoffMidnightMs = Date.parse(`${cutoffStr}T00:00:00.000Z`);

    const rows = await this.db.all(
      `
      WITH per_day AS (
        SELECT
          substr(datetime(timestamp_ms/1000, 'unixepoch'), 1, 10) AS date,
          SUM(CASE WHEN source = 'redstone' THEN item_count ELSE 0 END) AS redstone_items,
          SUM(CASE WHEN source = 'ardrive' THEN item_count ELSE 0 END) AS ardrive_items,
          SUM(CASE WHEN source = 'kyve' THEN item_count ELSE 0 END) AS kyve_items,
          SUM(CASE WHEN source = 'ario' THEN item_count ELSE 0 END) AS ario_items
        FROM bundles
        WHERE timestamp_ms >= ?
        GROUP BY date
      )
      SELECT
        date,
        redstone_items,
        ardrive_items,
        kyve_items,
        0 AS ao_messages,
        ario_items,
        (redstone_items + ardrive_items + kyve_items + 0 + ario_items) AS total_items
      FROM per_day
      WHERE date >= ?
      ORDER BY date ASC
      `,
      cutoffMidnightMs,
      cutoffStr
    );

    return rows;
  }
}

// ============================================================================
// Initialize Storage & Express App
// ============================================================================

const db = await openDb({ dbPath: process.env.DB_PATH });
const storage = new Storage(db);
const app = express();

app.get("/", (req, res) => {
  res.status(200).send("arweave-stats API is running");
});

// CORS - restricted to specific domains
const allowedOriginPatterns = [
  /^https?:\/\/(.*\.)?eye-of-ao/,      // Matches eye-of-ao.com, dev-eye-of-ao.com, etc.
  /^https?:\/\/(.*\.)?dev-eye-of-ao/,
    /^http:\/\/localhost(:\d+)?$/        // Matches localhost with any port
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like Postman, curl, or same-origin)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin matches any pattern
    const isAllowed = allowedOriginPatterns.some(pattern => pattern.test(origin));

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json());

// ============================================================================
// ANS-104 Bundle Parser
// ============================================================================

async function parseANS104Header(txid) {
  const gateway = process.env.ARWEAVE_GATEWAY || 'https://arweave.net/raw';

  try {
    const response = await axios.get(`${gateway}/${txid}`, {
      headers: { 'Range': 'bytes=0-31' },
      responseType: 'arraybuffer',
      timeout: 10000
    });

    const buffer = Buffer.from(response.data);

    if (buffer.length < 32) {
      console.warn(`[Parser] Bundle ${txid}: header too short (${buffer.length} bytes) - retrying`);
      // Throw error to trigger retry - incomplete response from gateway
      throw new Error(`Incomplete header: ${buffer.length} bytes`);
    }

    // ANS-104: First 32 bytes represent item count
    // Read as little-endian 64-bit integer (first 8 bytes)
    const itemCount = Number(buffer.readBigUInt64LE(0));

    return itemCount;
  } catch (error) {
    if (error.response?.status === 404) {
      console.warn(`[Parser] Bundle ${txid}: not found (404) - retrying`);
      // Throw error to trigger retry - bundle may not be propagated to gateway yet
      throw new Error('Bundle not found (404)');
    }
    throw error;
  }
}

async function batchParseBundles(bundles, source) {
  const results = new Map();
  const batchSize = 5;
  const total = bundles.length;

  console.log(`[Parser] Starting to parse ${total} ${source} bundles...`);

  let runningTotal = 0;
  let lastLoggedDate = null;
  const dailyTotals = new Map();

  for (let i = 0; i < bundles.length; i += batchSize) {
    const batch = bundles.slice(i, i + batchSize);
    const progress = Math.floor((i / total) * 100);
    console.log(`[Parser] Progress: ${i}/${total} (${progress}%) - ${source}`);

    const promises = batch.map(async (bundle) => {
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        try {
          const count = await parseANS104Header(bundle.txid);

          // Successfully parsed - store result and exit retry loop
          results.set(bundle.txid, count);
          break;
        } catch (error) {
          retries++;
          if (retries >= maxRetries) {
            // Log detailed error information
            const errorDetails = [];
            if (error.response) {
              errorDetails.push(`HTTP ${error.response.status}`);
              if (error.response.statusText) {
                errorDetails.push(error.response.statusText);
              }
            } else if (error.code) {
              errorDetails.push(error.code);
            }
            if (error.message) {
              errorDetails.push(error.message);
            }
            const errorStr = errorDetails.length > 0 ? `: ${errorDetails.join(' - ')}` : '';
            console.error(`[Parser] Failed to parse ${bundle.txid} after ${maxRetries} retries${errorStr}`);
            results.set(bundle.txid, 0);
          } else {
            // Wait before retrying (exponential backoff: 1s, 2s, 3s)
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
          }
        }
      }
    });

    await Promise.all(promises);

    // Log daily totals for this batch
    for (const bundle of batch) {
      const itemCount = results.get(bundle.txid) || 0;
      runningTotal += itemCount;

      // Debug: Log first few to check parsing
      if (i === 0 && batch.indexOf(bundle) < 3) {
        console.log(`[Debug] Bundle ${bundle.txid.substring(0, 10)}... - item_count: ${itemCount}`);
      }

      const date = new Date(bundle.timestamp).toISOString().split('T')[0];
      if (!dailyTotals.has(date)) {
        dailyTotals.set(date, 0);
      }
      dailyTotals.set(date, dailyTotals.get(date) + itemCount);

      // Log when we switch to a new day
      if (date !== lastLoggedDate) {
        if (lastLoggedDate !== null) {
          console.log(`[Daily] ${lastLoggedDate} - ${source}: ${dailyTotals.get(lastLoggedDate)} items | Running total: ${runningTotal}`);
        }
        lastLoggedDate = date;
      }
    }

    // Delay between batches
    if (i + batchSize < bundles.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  // Log final day
  if (lastLoggedDate !== null) {
    console.log(`[Daily] ${lastLoggedDate} - ${source}: ${dailyTotals.get(lastLoggedDate)} items | Running total: ${runningTotal}`);
  }

  console.log(`[Parser] ${source} complete: ${bundles.length} bundles, ${runningTotal} total items`);

  return results;
}

// ============================================================================
// GraphQL Queries
// ============================================================================

async function queryGraphQL(queryString) {
  const endpoint = process.env.GRAPHQL_ENDPOINT || 'https://arweave-search.goldsky.com/graphql';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: queryString })
  });

  if (!response.ok) {
    throw new Error(`GraphQL HTTP ${response.status}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(JSON.stringify(result.errors));
  }

  return result;
}

async function getCurrentIndexedBlockHeight() {
  // Returns the highest block height currently indexed by the GraphQL provider.
  // This is the safest "current height" to use for scanning, because it reflects
  // what the indexer can actually return (unlike the chain tip which may be ahead).
  const query = `
    query {
      transactions(first: 1, sort: HEIGHT_DESC) {
        edges {
          node { block { height } }
        }
      }
    }
  `;

  const result = await queryGraphQL(query);
  const height = result?.data?.transactions?.edges?.[0]?.node?.block?.height;
  if (typeof height !== 'number') {
    throw new Error('Unable to determine indexed block height from GraphQL');
  }
  return height;
}

function buildBundleQuery(source, minHeight, maxHeight, cursor = null) {
  const tagMappings = {
    redstone: 'tags: [{ name: "Bundler-App-Name", values: ["Redstone"] }]',
    ardrive: 'tags: [{ name: "Bundler-App-Name", values: ["ArDrive"] }]',
    kyve: 'tags: [{ name: "Bundler-App-Name", values: ["KYVE"] }]',
    ario: 'tags: [{ name: "Bundler-App-Name", values: ["AR.IO Network"] }]'
  };

  const tagFilter = tagMappings[source] || '';

  return `
    query {
      transactions(
        first: 100
        ${tagFilter}
        block: { min: ${minHeight}, max: ${maxHeight} }
        sort: HEIGHT_ASC
        ${cursor ? `, after: "${cursor}"` : ''}
      ) {
        pageInfo { hasNextPage }
        edges {
          cursor
          node {
            id
            block { height timestamp }
          }
        }
      }
    }
  `;
}

// ============================================================================
// Bundle Processing
// ============================================================================

async function processBundlesForSource(source, startHeight, endHeight, recount = false) {
  console.log(`[Processor] Processing ${source} bundles from ${startHeight} to ${endHeight}`);
  if (recount) {
    console.log(`[Processor] Recount mode: will re-parse all bundles including existing ones`);
  }

  const bundles = [];
  let cursor = null;
  let hasNextPage = true;

  // Discover bundle transactions
  while (hasNextPage) {
    const query = buildBundleQuery(source, startHeight, endHeight, cursor);
    const result = await queryGraphQL(query);

    const edges = result.data.transactions.edges;
    hasNextPage = result.data.transactions.pageInfo.hasNextPage;

    if (edges.length > 0) {
      cursor = edges[edges.length - 1].cursor;
    }

    const txids = edges.map(e => e?.node?.id).filter(Boolean);
    const existing = await storage.hasBundles(txids);

    for (const edge of edges) {
      const tx = edge.node;
      // Skip existing bundles unless recount mode is enabled
      if (!recount && existing.has(tx.id)) {
        continue;
      }

      bundles.push({
        txid: tx.id,
        source,
        height: tx.block.height,
        timestamp: tx.block.timestamp * 1000
      });
    }

    console.log(`[Processor] Discovered ${edges.length} ${source} bundles (total: ${bundles.length})`);
  }

  // Parse ANS-104 headers
  if (bundles.length > 0) {
    console.log(`[Processor] Parsing ${bundles.length} ${source} bundle headers...`);
    const itemCounts = await batchParseBundles(bundles, source);

    // Assign item counts to bundles
    for (const bundle of bundles) {
      bundle.item_count = itemCounts.get(bundle.txid) || 0;
      bundle.computed_at = Date.now();
    }

    // Filter out bundles with 0 item_count - these are temporary failures that should be retried next run
    const originalCount = bundles.length;
    const validBundles = bundles.filter(b => b.item_count > 0);
    const failedCount = originalCount - validBundles.length;

    if (failedCount > 0) {
      console.warn(`[Processor] Skipping ${failedCount} bundles with 0 item_count (will retry next run)`);
    }

    return validBundles;
  }

  return bundles;
}

async function getCurrentBlockHeight() {
  const response = await fetch('https://arweave.net/info');
  const data = await response.json();
  return data.height;
}

// File-based lock to prevent concurrent runs across processes
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCK_FILE = path.join(__dirname, 'logs', 'cron.lock');
const DIAG_LOG_FILE = path.join(__dirname, 'logs', 'diagnostics.log');
let lockFd = null;

// Ensure logs directory exists
try {
  fs.mkdirSync(path.join(__dirname, 'logs'), { recursive: true });
} catch (e) {
  // Directory already exists
}

// Diagnostic logger - writes to file to capture issues
function logDiagnostic(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  console.log(message);
  try {
    fs.appendFileSync(DIAG_LOG_FILE, logLine);
  } catch (error) {
    // Silently fail if we can't write
  }
}

async function acquireLock() {
  try {
    // Try to open the lock file with exclusive flag (fails if already locked)
    lockFd = fs.openSync(LOCK_FILE, 'wx');
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') {
      // Lock file exists, check if process is still alive
      try {
        const data = fs.readFileSync(LOCK_FILE, 'utf8');
        const pid = parseInt(data, 10);
        // Check if process with this PID exists
        try {
          process.kill(pid, 0); // Signal 0 checks if process exists
          return false; // Process exists, lock is valid
        } catch {
          // Process doesn't exist, stale lock - remove it
          fs.unlinkSync(LOCK_FILE);
          lockFd = fs.openSync(LOCK_FILE, 'wx');
          return true;
        }
      } catch {
        return false;
      }
    }
    return false;
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

async function processNewData(replayBlocks = 0, recount = false) {
  // Try to acquire the lock
  if (!await acquireLock()) {
    console.warn('[Job] Processing already in progress (lock file exists), skipping this run');
    return;
  }

  // Write our PID to the lock file
  try {
    fs.writeFileSync(LOCK_FILE, String(process.pid));
  } catch (error) {
    console.error('[Lock] Failed to write PID to lock file:', error);
  }

  try {
    console.log('[Job] Starting bundle processing...');
    if (recount) {
      console.log('[Job] Recount mode active - will re-parse existing bundles');
    }

    const metadata = await storage.getMetadata();

    logDiagnostic('========== BLOCK HEIGHT DIAGNOSTICS START ==========');
    logDiagnostic(`Last indexed heights from DB: redstone=${metadata.last_indexed_height.redstone}, ardrive=${metadata.last_indexed_height.ardrive}, ario=${metadata.last_indexed_height.ario}, kyve=${metadata.last_indexed_height.kyve}`);

    const [chainTipHeight, indexedTipHeight] = await Promise.all([
      getCurrentBlockHeight(),
      getCurrentIndexedBlockHeight()
    ]);

    logDiagnostic(`Chain tip height (arweave.net/info): ${chainTipHeight}`);
    logDiagnostic(`Indexed tip height (GraphQL): ${indexedTipHeight}`);

    // We treat the chain tip as source-of-truth, but we can only fetch what the indexer has actually indexed.
    // If indexedTipHeight lags behind chainTipHeight, using the chain tip as the scan end can permanently skip bundles.
    const endHeightAvailable = Math.min(chainTipHeight, indexedTipHeight);

    // Optional extra safety margin if you want to stay behind the indexed tip.
    // Default 0 because indexedTipHeight already reflects what GraphQL can serve.
    const lagBlocks = Math.max(0, parseInt(process.env.INDEXER_LAG_BLOCKS || '0', 10) || 0);
    const overlapBlocks = 1500; // ~2 day overlap to catch any indexer lag issues
    const recountOverlapBlocks = 100; // Always recount the last 100 blocks to verify bundle counts
    const safeEndHeight = Math.max(0, endHeightAvailable - lagBlocks);

    logDiagnostic(`Calculated: endHeightAvailable=${endHeightAvailable} (min of chain/indexed), safeEndHeight=${safeEndHeight} (minus lagBlocks=${lagBlocks})`);
    logDiagnostic(`Config: overlapBlocks=${overlapBlocks}, recountOverlapBlocks=${recountOverlapBlocks}, replayBlocks=${replayBlocks}`);

    // Initialize starting heights if this is first run
    // Generalized: for any source, if no last height, set a default lookback
    const defaultLookbacks = {
      redstone: 720 * 90, // ~90 days
      ardrive: 720 * 90,
      ario: 720 * 90,
      kyve: 720 * 90,
    };
    for (const source of ['redstone', 'ardrive', 'ario', 'kyve']) {
      if (!(source in metadata.last_indexed_height) || metadata.last_indexed_height[source] === 0) {
        const lookback = defaultLookbacks[source] || 720 * 90;
        const startHeight = Math.max(0, safeEndHeight - lookback);
        // Store the last fully indexed height. Setting to (startHeight - 1) ensures we include startHeight.
        const initialLastHeight = Math.max(0, startHeight - 1);
        metadata.last_indexed_height[source] = initialLastHeight;
        console.log(`[Job] ${source} first run - starting from height ${startHeight} (initial last_indexed_height=${initialLastHeight})`);
        await storage.setLastIndexedHeight(source, initialLastHeight);
      }
    }

    // Process AR.IO, KYVE, then ArDrive, then Redstone
    const sources = ['ario', 'kyve', 'ardrive', 'redstone'];
    let anyNewBundles = false;

    for (const source of sources) {
      const rawLastHeight = metadata.last_indexed_height[source];

      // If we previously advanced beyond safeEndHeight (old behavior), roll back the effective cursor.
      const effectiveLastHeight = Math.min(rawLastHeight, safeEndHeight);

      // Always log what we *intend* to cover for this source.
      // Apply overlap and replay adjustment
      const baseStart = Math.max(0, effectiveLastHeight - overlapBlocks + 1);
      const plannedStart = Math.max(0, baseStart - replayBlocks);
      const plannedEnd = safeEndHeight;
      const blocksToProcess = plannedEnd - plannedStart + 1;

      logDiagnostic(`${source}: rawLast=${rawLastHeight}, effectiveLast=${effectiveLastHeight}, plannedStart=${plannedStart}, plannedEnd=${plannedEnd}, blocksToProcess=${blocksToProcess}`);

      console.log(
        `[Job] ${source} plan last=${rawLastHeight} effectiveLast=${effectiveLastHeight} ` +
        `start=${plannedStart} end=${plannedEnd} (overlapBlocks=${overlapBlocks}, replayBlocks=${replayBlocks}, safeEndHeight=${safeEndHeight})`
      );

      // CRITICAL WARNING: Check for abnormally large block ranges
      if (blocksToProcess > 2500) {
        logDiagnostic(`⚠️  WARNING: ${source} will process ${blocksToProcess} blocks! This is abnormally high!`);
        console.warn(`[Job] ⚠️  WARNING: ${source} will process ${blocksToProcess} blocks (expected <500 for normal runs)!`);
      }

      if (rawLastHeight > safeEndHeight) {
        logDiagnostic(`⚠️  WARNING: ${source} last_indexed_height (${rawLastHeight}) is ahead of safeEndHeight (${safeEndHeight})`);
        console.warn(
          `[Job] ${source} last_indexed_height (${rawLastHeight}) is ahead of safeEndHeight (${safeEndHeight}); ` +
          'using safeEndHeight and overlap rescan to avoid skipped bundles.'
        );
      }

      if (effectiveLastHeight >= safeEndHeight) {
        // Step 1: Recount the last 20 blocks (verify existing bundle counts)
        const recountStart = Math.max(0, safeEndHeight - recountOverlapBlocks + 1);
        const recountEnd = safeEndHeight;
        if (recountStart <= recountEnd) {
          console.log(`[Job] ${source} recount range ${recountStart}..${recountEnd} (verifying existing bundles)`);
          const recountBundles = await processBundlesForSource(source, recountStart, recountEnd, true);
          if (recountBundles.length > 0) {
            const inserted = await storage.addBundles(recountBundles);
            console.log(`[Job] Recounted ${inserted}/${recountBundles.length} ${source} bundles`);
          }
        }

        // Step 2: Still rescan an overlap window near the safe end in case indexer lag caused missing bundles earlier.
        if (overlapBlocks > 0 && safeEndHeight > 0) {
          const baseRescanStart = Math.max(0, safeEndHeight - overlapBlocks + 1);
          const rescanStart = Math.max(0, baseRescanStart - replayBlocks);
          const rescanEnd = safeEndHeight;
          console.log(`[Job] ${source} overlap rescan ${rescanStart}..${rescanEnd}`);
          const rescanBundles = await processBundlesForSource(source, rescanStart, rescanEnd, recount);
          if (rescanBundles.length > 0) {
            const inserted = await storage.addBundles(rescanBundles);
            if (inserted > 0) {
              anyNewBundles = true;
            }
            console.log(`[Job] Saved ${inserted}/${rescanBundles.length} ${source} bundles to storage (overlap rescan)`);
          }
          console.log(`[Job] ${source} overlap rescan complete`);
        } else {
          console.log(`[Job] ${source} is up to date`);
        }
        // Normalize cursor to safeEndHeight so we don't get stuck "ahead".
        metadata.last_indexed_height[source] = safeEndHeight;
        metadata.last_update = new Date().toISOString();
        await storage.setLastIndexedHeight(source, safeEndHeight);
        await storage.setLastUpdate(metadata.last_update);
        continue;
      }

      const baseScanStart = Math.max(0, effectiveLastHeight - overlapBlocks + 1);
      const scanStart = Math.max(0, baseScanStart - replayBlocks);
      const scanEnd = safeEndHeight;

      // Step 1: Recount the last 20 blocks (verify existing bundle counts)
      const recountStart = Math.max(0, effectiveLastHeight - recountOverlapBlocks + 1);
      const recountEnd = effectiveLastHeight;
      if (recountStart <= recountEnd) {
        console.log(`[Job] ${source} recount range ${recountStart}..${recountEnd} (verifying existing bundles)`);
        const recountBundles = await processBundlesForSource(source, recountStart, recountEnd, true);
        if (recountBundles.length > 0) {
          const inserted = await storage.addBundles(recountBundles);
          console.log(`[Job] Recounted ${inserted}/${recountBundles.length} ${source} bundles`);
        }
      }

      // Step 2: Scan for new bundles (includes overlap + replay range)
      console.log(`[Job] ${source} scan range ${scanStart}..${scanEnd}`);
      const newBundles = await processBundlesForSource(source, scanStart, scanEnd, recount);

      // Save immediately after each source completes
      if (newBundles.length > 0) {
        const inserted = await storage.addBundles(newBundles);
        if (inserted > 0) {
          anyNewBundles = true;
        }
        console.log(`[Job] Saved ${inserted}/${newBundles.length} ${source} bundles to storage`);
      }

      // Update metadata for this source to the safeEndHeight we actually intended to cover
      metadata.last_indexed_height[source] = scanEnd;
      metadata.last_update = new Date().toISOString();
      await storage.setLastIndexedHeight(source, scanEnd);
      await storage.setLastUpdate(metadata.last_update);
      console.log(`[Job] ${source} processing complete`);
    }

    // No full recompute needed; daily aggregates are computed from SQL.
    // anyNewBundles is kept for logging/future use.

    console.log('[Job] Processing completed successfully');
  } catch (error) {
    console.error('[Job] Error:', error);
    throw error;
  } finally {
    // Always release the lock, even if processing failed
    releaseLock();
  }
}

// ============================================================================
// API Routes
// ============================================================================

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/arweave/bundle-items/daily', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    if (days < 1 || days > 365) {
      return res.status(400).json({ error: 'days must be between 1 and 365' });
    }

    const [aggregates, meta] = await Promise.all([
      storage.getDailyAggregates(days),
      storage.getMetadata()
    ]);

    res.json({
      data: aggregates,
      metadata: {
        days,
        total_records: aggregates.length,
        last_update: meta.last_update
      }
    });
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/arweave/metadata', async (req, res) => {
  try {
    const meta = await storage.getMetadata();
    res.json(meta);
  } catch (error) {
    console.error('[API] Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================================
// Start Server & Scheduler
// ============================================================================

const port = process.env.API_PORT || 3000;

// Only start the server / cron runner when this file is executed directly.
// If this module is imported (e.g., `node -e "import('./server.js').then(m => m.processNewData())"`),
// we avoid binding to the port and avoid auto-start processing.
const isMainModule = (() => {
  try {
    const thisFile = fileURLToPath(import.meta.url);
    const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
    return entryFile && path.resolve(thisFile) === entryFile;
  } catch {
    return false;
  }
})();

// Check if running in cron mode
const isCronMode = process.argv.includes('--cron');

// Parse replay flag: --replay <blocks>
let replayBlocks = 0;
const replayIndex = process.argv.indexOf('--replay');
if (replayIndex !== -1 && process.argv[replayIndex + 1]) {
  const parsed = parseInt(process.argv[replayIndex + 1], 10);
  if (!isNaN(parsed) && parsed > 0) {
    replayBlocks = parsed;
    console.log(`[Config] Replay mode enabled: reprocessing ${replayBlocks} extra blocks`);
  } else {
    console.error('[Config] Invalid --replay value. Must be a positive integer.');
    process.exit(1);
  }
}

// Parse recount flag: --recount
const shouldRecount = process.argv.includes('--recount');
if (shouldRecount) {
  console.log('[Config] Recount mode enabled: will re-parse all bundle headers');
}

if (!isMainModule) {
  // Imported module: do not start listeners or jobs automatically.
} else if (isCronMode) {
  // Cron mode: just run the job and exit
  console.log('[Cron] Starting bundle processing...');
  processNewData(replayBlocks, shouldRecount)
    .then(() => {
      console.log('[Cron] Job completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Cron] Job failed:', error);
      process.exit(1);
    });
} else {
  // API mode: start the server
  const server = app.listen(port, () => {
    console.log(`[Server] Listening on port ${port}`);
    console.log(`[Server] CORS patterns: eye-of-ao domains, localhost, 127.0.0.1`);
    console.log(`[Server] Run with --cron flag to process bundles without starting server`);
    console.log(`[Server] Run with --replay <blocks> to reprocess additional historical blocks`);
    console.log(`[Server] Run with --recount to re-parse all bundle headers (use with --replay)`);
  });

  server.on('error', (error) => {
    console.error('[Server] Failed to start HTTP listener:', error);
    process.exit(1);
  });

  // Run on startup if enabled OR if replay flag is set
  if (process.env.RUN_ON_STARTUP === 'true' || replayBlocks > 0) {
    if (replayBlocks > 0) {
      console.log(`[Replay] Processing ${replayBlocks} historical blocks in background...`);
    } else {
      console.log('[Startup] Running initial processing...');
    }
    processNewData(replayBlocks, shouldRecount).catch((error) => {
      console.error('[Processing] Failed:', error);
    });
  }
}

// Clean up lock file on process termination
process.on('SIGINT', () => {
  console.log('\n[Shutdown] Received SIGINT, cleaning up...');
  releaseLock();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Shutdown] Received SIGTERM, cleaning up...');
  releaseLock();
  process.exit(0);
});

// Export processNewData for programmatic usage
export { processNewData };
