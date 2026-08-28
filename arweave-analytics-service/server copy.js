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
  const gateway = process.env.ARWEAVE_GATEWAY || 'https://arweave.net';

  try {
    const response = await axios.get(`${gateway}/${txid}`, {
      headers: { 'Range': 'bytes=0-31' },
      responseType: 'arraybuffer',
      timeout: 10000
    });

    const buffer = Buffer.from(response.data);

    if (buffer.length < 32) {
      console.warn(`[Parser] Bundle ${txid}: header too short`);
      return 0;
    }

    // ANS-104: First 32 bytes represent item count
    // Read as little-endian 64-bit integer (first 8 bytes)
    const itemCount = Number(buffer.readBigUInt64LE(0));

    return itemCount;
  } catch (error) {
    if (error.response?.status === 404) {
      console.warn(`[Parser] Bundle ${txid}: not found (404)`);
      return 0;
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

          // Retry if count is 0 (might be temp issue)
          if (count === 0 && retries < maxRetries - 1) {
            retries++;
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
            continue;
          }

          results.set(bundle.txid, count);
          break;
        } catch (error) {
          retries++;
          if (retries >= maxRetries) {
            console.error(`[Parser] Failed to parse ${bundle.txid} after ${maxRetries} retries`);
            results.set(bundle.txid, 0);
          } else {
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

async function processBundlesForSource(source, startHeight, endHeight) {
  console.log(`[Processor] Processing ${source} bundles from ${startHeight} to ${endHeight}`);

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
      if (existing.has(tx.id)) {
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
  }

  return bundles;
}

async function getCurrentBlockHeight() {
  const response = await fetch('https://arweave.net/info');
  const data = await response.json();
  return data.height;
}

async function processNewData() {
  try {
    console.log('[Job] Starting bundle processing...');

    const metadata = await storage.getMetadata();
    const [chainTipHeight, indexedTipHeight] = await Promise.all([
      getCurrentBlockHeight(),
      getCurrentIndexedBlockHeight()
    ]);

    console.log(`[Job] Chain tip height (on-chain): ${chainTipHeight}`);
    console.log(`[Job] Indexed tip height (GraphQL): ${indexedTipHeight}`);

    // We treat the chain tip as source-of-truth, but we can only fetch what the indexer has actually indexed.
    // If indexedTipHeight lags behind chainTipHeight, using the chain tip as the scan end can permanently skip bundles.
    const endHeightAvailable = Math.min(chainTipHeight, indexedTipHeight);

    // Optional extra safety margin if you want to stay behind the indexed tip.
    // Default 0 because indexedTipHeight already reflects what GraphQL can serve.
    const lagBlocks = Math.max(0, parseInt(process.env.INDEXER_LAG_BLOCKS || '0', 10) || 0);
    const overlapBlocks = 5;
    const safeEndHeight = Math.max(0, endHeightAvailable - lagBlocks);

    console.log(`[Job] Using safeEndHeight=${safeEndHeight} (lagBlocks=${lagBlocks}, overlapBlocks=${overlapBlocks})`);

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
      const plannedStart = Math.max(0, effectiveLastHeight - overlapBlocks + 1);
      const plannedEnd = safeEndHeight;
      console.log(
        `[Job] ${source} plan last=${rawLastHeight} effectiveLast=${effectiveLastHeight} ` +
        `start=${plannedStart} end=${plannedEnd} (overlapBlocks=${overlapBlocks}, safeEndHeight=${safeEndHeight})`
      );
      if (rawLastHeight > safeEndHeight) {
        console.warn(
          `[Job] ${source} last_indexed_height (${rawLastHeight}) is ahead of safeEndHeight (${safeEndHeight}); ` +
          'using safeEndHeight and overlap rescan to avoid skipped bundles.'
        );
      }

      if (effectiveLastHeight >= safeEndHeight) {
        // Still rescan an overlap window near the safe end in case indexer lag caused missing bundles earlier.
        if (overlapBlocks > 0 && safeEndHeight > 0) {
          const rescanStart = Math.max(0, safeEndHeight - overlapBlocks + 1);
          const rescanEnd = safeEndHeight;
          console.log(`[Job] ${source} overlap rescan ${rescanStart}..${rescanEnd}`);
          const rescanBundles = await processBundlesForSource(source, rescanStart, rescanEnd);
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

      const scanStart = Math.max(0, effectiveLastHeight - overlapBlocks + 1);
      const scanEnd = safeEndHeight;
      console.log(`[Job] ${source} scan range ${scanStart}..${scanEnd}`);

      const newBundles = await processBundlesForSource(source, scanStart, scanEnd);

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

if (!isMainModule) {
  // Imported module: do not start listeners or jobs automatically.
} else if (isCronMode) {
  // Cron mode: just run the job and exit
  console.log('[Cron] Starting bundle processing...');
  processNewData()
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
  });

  server.on('error', (error) => {
    console.error('[Server] Failed to start HTTP listener:', error);
    process.exit(1);
  });

  // Run on startup if enabled
  if (process.env.RUN_ON_STARTUP === 'true') {
    console.log('[Startup] Running initial processing...');
    processNewData().catch((error) => {
      console.error('[Startup] Initial processing failed:', error);
    });
  }
}

// Export processNewData for programmatic usage
export { processNewData };
