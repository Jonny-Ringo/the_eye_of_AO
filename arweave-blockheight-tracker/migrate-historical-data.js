import { Storage } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrateHistoricalData() {
  console.log('Starting historical data migration...\n');

  // Read the backup file
  const backupPath = path.join(__dirname, '..', 'backups', 'Blockheights backup 2-22-2026.txt');

  if (!fs.existsSync(backupPath)) {
    console.error(`Error: Backup file not found at ${backupPath}`);
    process.exit(1);
  }

  const backupContent = fs.readFileSync(backupPath, 'utf8');

  // Parse the JSON structure
  // The file contains: { "name": "DailyBlocks", "value": "[{...},{...}]" }
  const backupData = JSON.parse(backupContent);
  const dailyBlocksJSON = backupData.value;
  const dailyBlocks = JSON.parse(dailyBlocksJSON);

  console.log(`Found ${dailyBlocks.length} records to migrate\n`);

  // Initialize storage
  const storage = await Storage.init();

  let inserted = 0;
  let skipped = 0;
  let errors = 0;

  // Insert each record
  for (const record of dailyBlocks) {
    try {
      await storage.addDailyBlock(
        record.date,
        record.blockHeight,
        record.timestamp
      );
      inserted++;

      if (inserted % 50 === 0) {
        console.log(`Progress: ${inserted}/${dailyBlocks.length} records inserted...`);
      }
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        skipped++;
      } else {
        console.error(`Error inserting ${record.date}:`, error.message);
        errors++;
      }
    }
  }

  await storage.close();

  console.log('\n=== Migration Complete ===');
  console.log(`Total records: ${dailyBlocks.length}`);
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped (already exists): ${skipped}`);
  console.log(`Errors: ${errors}`);

  // Verify the data
  console.log('\n=== Verification ===');
  const verifyStorage = await Storage.init();
  const metadata = await verifyStorage.getMetadata();
  console.log(`Database now contains ${metadata.totalDailyRecords} daily records`);
  console.log(`Latest date: ${metadata.lastRecordedDate}`);
  console.log(`Latest block height: ${metadata.lastBlockHeight}`);

  const gaps = await verifyStorage.findDateGaps();
  if (gaps.length > 0) {
    console.log(`\n⚠ Warning: Found ${gaps.length} date gaps:`);
    gaps.forEach(gap => {
      console.log(`  Missing ${gap.missing_days} days between ${gap.after} and ${gap.before}`);
    });
  } else {
    console.log('\n✓ No date gaps found');
  }

  await verifyStorage.close();
}

migrateHistoricalData().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
