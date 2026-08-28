#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { openDb, utcDateStringFromMs } from './db.js';

function parseArgs(argv) {
  const args = {
    input: 'data/ArweaveAnalytics.js',
    output: 'data/ArweaveAnalytics.sqlite'
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input') args.input = argv[++i];
    else if (arg === '--output') args.output = argv[++i];
  }
  return args;
}

function loadLegacyFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const jsonContent = content
    .replace(/^module\.exports\s*=\s*/, '')
    .replace(/;?\s*$/, '');
  return JSON.parse(jsonContent);
}

async function main() {
  const { input, output } = parseArgs(process.argv);
  const inputPath = path.resolve(input);
  const outputPath = path.resolve(output);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input not found: ${inputPath}`);
  }

  if (fs.existsSync(outputPath)) {
    throw new Error(`Output already exists (refusing to overwrite): ${outputPath}`);
  }

  console.log(`[Migrate] Loading legacy file: ${inputPath}`);
  const legacy = loadLegacyFile(inputPath);

  const bundles = Array.isArray(legacy?.bundles) ? legacy.bundles : [];
  const daily = Array.isArray(legacy?.daily_aggregates) ? legacy.daily_aggregates : [];
  const metadata = legacy?.metadata || {};

  console.log(`[Migrate] bundles=${bundles.length}, daily_aggregates=${daily.length}`);

  // Create DB
  process.env.DB_PATH = outputPath;
  const db = await openDb({ dbPath: outputPath });

  // Fast migration pragmas
  await db.exec('PRAGMA synchronous = OFF;');
  await db.exec('PRAGMA journal_mode = WAL;');

  await db.exec('BEGIN;');
  try {
    // Metadata
    const lastUpdate = metadata?.last_update ?? null;
    await db.run('INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)', 'last_update', lastUpdate);

    const lastIndexed = metadata?.last_indexed_height || {};
    for (const source of ['redstone', 'ardrive', 'ario', 'kyve']) {
      const height = typeof lastIndexed[source] === 'number' ? lastIndexed[source] : 0;
      await db.run(
        'INSERT OR REPLACE INTO source_state(source, last_indexed_height) VALUES (?, ?)',
        source,
        height
      );
    }

    // Bundles
    const insertStmt = await db.prepare(
      'INSERT OR IGNORE INTO bundles(txid, source, height, timestamp_ms, item_count, computed_at_ms) VALUES (?, ?, ?, ?, ?, ?)'
    );

    for (let i = 0; i < bundles.length; i++) {
      const b = bundles[i];
      if (!b?.txid || !b?.source || typeof b?.height !== 'number' || typeof b?.timestamp !== 'number') {
        continue;
      }
      const itemCount = typeof b?.item_count === 'number' ? b.item_count : 0;
      const computedAt = typeof b?.computed_at === 'number' ? b.computed_at : Date.now();
      await insertStmt.run(b.txid, b.source, b.height, b.timestamp, itemCount, computedAt);

      if ((i + 1) % 5000 === 0) {
        console.log(`[Migrate] Inserted ${i + 1}/${bundles.length} bundles...`);
      }
    }

    await insertStmt.finalize();

    // Optional: verify daily aggregates match legacy by recalculating from bundles.
    // We don't persist daily_aggregates table in this minimal migration, but we can sanity check counts.
    if (daily.length > 0) {
      const legacyFirst = daily[0];
      const legacyLast = daily[daily.length - 1];
      console.log(`[Migrate] Legacy daily range: ${legacyFirst?.date} .. ${legacyLast?.date}`);

      // Spot check: compare totals for last legacy day
      const lastDate = legacyLast?.date;
      if (typeof lastDate === 'string') {
        const rows = await db.all(
          `
          SELECT source, SUM(item_count) as items
          FROM bundles
          WHERE substr(datetime(timestamp_ms/1000,'unixepoch'), 1, 10) = ?
          GROUP BY source
          `,
          lastDate
        );

        const bySource = Object.fromEntries(rows.map(r => [r.source, r.items]));
        console.log(`[Migrate] Spot check ${lastDate}:`, bySource);
      }
    }

    await db.exec('COMMIT;');
  } catch (error) {
    await db.exec('ROLLBACK;');
    throw error;
  } finally {
    await db.close();
  }

  console.log(`[Migrate] Complete. SQLite DB written: ${outputPath}`);
  console.log(`[Migrate] Tip: set DB_PATH=${outputPath} when running server/job`);
}

main().catch((error) => {
  console.error('[Migrate] Failed:', error);
  process.exit(1);
});
