# Arweave Blockheight Tracker

Node.js service that tracks Arweave block heights at UTC 00:00 daily. Runs hourly via cron on VPS, stores data in SQLite with automatic backups.

## Quick Reference

### VPS Management

**Check database:**
```bash
cd /root/arweave-blockheight-tracker
node cli.js last
node cli.js list --days 30
node cli.js verify
```

**Update block height:**
```bash
node cli.js update --date 2026-02-28 --height 1867147
```

**Insert missing date:**
```bash
node cli.js insert --date 2026-02-27 --height 1865787 --timestamp 1771632000000
```

**Delete entry:**
```bash
node cli.js delete --date 2026-02-25
```

**View logs:**
```bash
tail -f /root/arweave-blockheight-tracker/logs/diagnostics.log
```

**Test API:**
```bash
curl http://137.184.115.211:3001/api/blockheights/daily?days=5
```

**Manually run cron:**
```bash
npm run cron
```

**Restart server:**
```bash
# Kill existing process
ps aux | grep node
kill <PID>

# Start in screen
screen -S oracle
npm start
# Ctrl+A, D to detach
```

---

## Initial Deployment

### 1. Local Setup

```bash
cd C:\Users\User\Desktop\AO_Projects_Master\The_Eye\dev\arweave-blockheight-tracker
npm install

# Run migration if needed
node migrate-historical-data.js

# Verify local data
node cli.js last
```

### 2. Deploy to VPS

```bash
# Create tarball (excludes data, logs, backups, node_modules)
cd C:\Users\User\Desktop\AO_Projects_Master\The_Eye\dev

tar -czf arweave-blockheight-tracker.tgz `
  --exclude='node_modules' `
  --exclude='data' `
  --exclude='logs' `
  --exclude='backups' `
  --exclude='.env' `
  --exclude='migrate-historical-data.js' `
  arweave-blockheight-tracker

# Transfer to VPS
scp arweave-blockheight-tracker.tgz root@137.184.115.211:/root/

# SSH to VPS
ssh root@137.184.115.211

# Extract
cd /root
tar -xzf arweave-blockheight-tracker.tgz && rm arweave-blockheight-tracker.tgz

# Install dependencies
cd /root/arweave-blockheight-tracker
npm install

# Create .env
nano .env
```

**.env contents:**
```env
API_PORT=3001
DB_PATH=data/BlockHeights.sqlite
ARWEAVE_GATEWAY=https://arweave.net
NODE_ENV=production
BACKUP_RETENTION_COUNT=24
ALLOW_LOCALHOST=true       # Allow localhost for local development
DEFAULT_QUERY_DAYS=730      # Default 2 years of data
```

**CORS allowed origins:**
- `eye-of-ao.*` (production)
- `dev-eye-of-ao.*` (dev/staging)
- `localhost:*` (if `ALLOW_LOCALHOST=true`)

### 3. Transfer Database

```bash
# From local machine
scp "C:\Users\User\Desktop\AO_Projects_Master\The_Eye\dev\arweave-blockheight-tracker\data\BlockHeights.sqlite" root@137.184.115.211:/root/arweave-blockheight-tracker/data/

# Verify on VPS
ssh root@137.184.115.211
cd /root/arweave-blockheight-tracker
node cli.js last
```

### 4. Start Service

```bash
# Test first
npm run cron

# Start server in screen
screen -S oracle
npm start
# Press Ctrl+A, then D to detach
```

### 5. Setup Cron (Optional)

```bash
crontab -e
# Add this line:
# 0 * * * * cd /root/arweave-blockheight-tracker && /usr/bin/node server.js --cron >> logs/cron.log 2>&1
```

---

## API Endpoints

**GET /api/blockheights/daily?days=30**
```json
{
  "success": true,
  "data": [
    {
      "date": "2026-02-28",
      "block_height": 1867147,
      "timestamp_ms": 1771718400000,
      "recorded_at_ms": 1771721000000
    }
  ],
  "metadata": {
    "days_requested": 30,
    "records_returned": 30,
    "latest_date": "2026-02-28"
  }
}
```

**GET /api/blockheights/latest**
```json
{
  "success": true,
  "data": {
    "date": "2026-02-28",
    "block_height": 1867147,
    "timestamp_ms": 1771718400000,
    "recorded_at_ms": 1771721000000
  }
}
```

**GET /health**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-01T00:00:00.000Z"
}
```

---

## Configuration

Edit `.env` file:

```env
API_PORT=3001                 # Server port
DB_PATH=data/BlockHeights.sqlite  # Database file path
ARWEAVE_GATEWAY=https://arweave.net  # Arweave gateway URL
NODE_ENV=production           # Environment mode
BACKUP_RETENTION_COUNT=24     # Keep last 24 backups
ALLOW_LOCALHOST=true          # Allow localhost CORS (for testing)
DEFAULT_QUERY_DAYS=730        # Default API response: 2 years
```

---

## How It Works

1. **Hourly cron** fetches current block height from arweave.net/info
2. **Records to hourly_checks** table
3. **At midnight UTC**, finds block closest to 00:00:00 from last 24-48hrs
4. **Inserts to daily_blocks** table with date = day that just ended
5. **Automatic backup** after each daily block insertion
6. **Cleanup** old hourly checks (keep 48hrs) and old backups (keep 24)

---

## Troubleshooting

**Empty database after transfer?**
- Check if WAL files exist: `ls -la data/`
- Consolidate WAL locally: `sqlite3 data/BlockHeights.sqlite "PRAGMA wal_checkpoint(TRUNCATE);"`
- Transfer again: `scp data/BlockHeights.sqlite root@137.184.115.211:/root/arweave-blockheight-tracker/data/`

**CLI shows "No records found"?**
- Check table exists: `sqlite3 data/BlockHeights.sqlite "SELECT name FROM sqlite_master WHERE type='table';"`
- Check record count: `sqlite3 data/BlockHeights.sqlite "SELECT COUNT(*) FROM daily_blocks;"`

**API returns empty data?**
- Check server is running: `ps aux | grep node`
- Check logs: `tail -f logs/diagnostics.log`
- Test locally first with `ALLOW_LOCALHOST=true`

---

## License

MIT
