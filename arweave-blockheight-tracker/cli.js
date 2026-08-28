import { Storage } from './db.js';
import { parseArgs } from 'node:util';

// Parse command line arguments
const { values, positionals } = parseArgs({
  options: {
    date: { type: 'string' },
    height: { type: 'string' },
    timestamp: { type: 'string' },
    days: { type: 'string' }
  },
  allowPositionals: true
});

const command = positionals[0];

// Show usage if no command provided
if (!command) {
  console.log('Arweave Blockheight Tracker - CLI Management Tool\n');
  console.log('Usage: node cli.js <command> [options]\n');
  console.log('Commands:');
  console.log('  update    Update existing block height for a date');
  console.log('            --date YYYY-MM-DD --height <number>');
  console.log('  insert    Insert a new date entry');
  console.log('            --date YYYY-MM-DD --height <number> [--timestamp <ms>]');
  console.log('  delete    Delete an entry');
  console.log('            --date YYYY-MM-DD');
  console.log('  list      List recent entries');
  console.log('            [--days <number>] (default: 7)');
  console.log('  get       Get block height for a specific date');
  console.log('            --date YYYY-MM-DD');
  console.log('  last      Show the last recorded entry');
  console.log('  verify    Check for gaps in daily records');
  console.log('\nExamples:');
  console.log('  node cli.js update --date 2026-02-22 --height 1862413');
  console.log('  node cli.js insert --date 2026-02-21 --height 1861693');
  console.log('  node cli.js delete --date 2026-02-25');
  console.log('  node cli.js list --days 30');
  console.log('  node cli.js get --date 2026-02-22');
  console.log('  node cli.js last');
  console.log('  node cli.js verify');
  process.exit(0);
}

async function main() {
  let storage;

  try {
    // Initialize storage
    storage = await Storage.init();

    switch (command) {
      case 'update': {
        if (!values.date || !values.height) {
          console.error('Error: --date and --height are required');
          process.exit(1);
        }

        const updated = await storage.updateDailyBlock(values.date, parseInt(values.height));

        if (updated) {
          console.log(`✓ Updated ${values.date} to height ${values.height}`);
        } else {
          console.log(`✗ Date ${values.date} not found in database`);
          process.exit(1);
        }
        break;
      }

      case 'insert': {
        if (!values.date || !values.height) {
          console.error('Error: --date and --height are required');
          process.exit(1);
        }

        const timestamp = values.timestamp ? parseInt(values.timestamp) : Date.now();
        await storage.addDailyBlock(values.date, parseInt(values.height), timestamp);
        console.log(`✓ Inserted ${values.date} with height ${values.height}`);
        break;
      }

      case 'delete': {
        if (!values.date) {
          console.error('Error: --date is required');
          process.exit(1);
        }

        const deleted = await storage.deleteDailyBlock(values.date);

        if (deleted) {
          console.log(`✓ Deleted ${values.date}`);
        } else {
          console.log(`✗ Date ${values.date} not found in database`);
          process.exit(1);
        }
        break;
      }

      case 'list': {
        const days = values.days ? parseInt(values.days) : 7;
        const records = await storage.getDailyBlocks(days);

        if (records.length === 0) {
          console.log('No records found');
        } else {
          console.log(`\nShowing last ${days} days:\n`);
          console.table(records.map(r => ({
            date: r.date,
            block_height: r.block_height,
            timestamp: new Date(r.timestamp_ms).toISOString(),
            recorded_at: new Date(r.recorded_at_ms).toISOString()
          })));
        }
        break;
      }

      case 'get': {
        if (!values.date) {
          console.error('Error: --date is required');
          process.exit(1);
        }

        const record = await storage.getDailyBlockByDate(values.date);

        if (record) {
          console.log(`\nBlock height for ${values.date}:\n`);
          console.table([{
            date: record.date,
            block_height: record.block_height,
            timestamp: new Date(record.timestamp_ms).toISOString(),
            recorded_at: new Date(record.recorded_at_ms).toISOString()
          }]);
        } else {
          console.log(`✗ No record found for date ${values.date}`);
          process.exit(1);
        }
        break;
      }

      case 'last': {
        const lastRecord = await storage.getLastDailyBlock();

        if (lastRecord) {
          console.log('\nLast recorded entry:\n');
          console.table([{
            date: lastRecord.date,
            block_height: lastRecord.block_height,
            timestamp: new Date(lastRecord.timestamp_ms).toISOString(),
            recorded_at: new Date(lastRecord.recorded_at_ms).toISOString()
          }]);
        } else {
          console.log('✗ No records found in database');
          process.exit(1);
        }
        break;
      }

      case 'verify': {
        const gaps = await storage.findDateGaps();

        if (gaps.length > 0) {
          console.log('\n⚠ Missing dates found:\n');
          console.table(gaps);
          process.exit(1);
        } else {
          console.log('✓ No gaps detected - all consecutive dates present');
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        console.log('Run "node cli.js" without arguments to see usage');
        process.exit(1);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    if (storage) {
      await storage.close();
    }
  }
}

main();
