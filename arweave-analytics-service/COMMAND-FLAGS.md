# Command-Line Flags Reference

## Running the Service

### Start Server (API Mode)
```bash
npm start
# or
node server.js
```

Starts the HTTP server on port 3000 (default). Runs initial processing if `RUN_ON_STARTUP=true` in `.env`.

---

### Cron Mode (Process and Exit)
```bash
npm run cron
# or
node server.js --cron
```

Runs bundle processing once and exits (for cron jobs). No HTTP server.

---

## Command-Line Flags

### `--replay <blocks>`

Reprocesses additional historical blocks beyond the normal overlap window.

**Usage:**
```bash
# Direct node command
node server.js --replay 5000

# With npm (use -- to pass args to script)
npm start -- --replay 5000
```

**What it does:**
- Extends the scan range backward by the specified number of blocks
- Useful for backfilling historical data or recovering from missed bundles
- Example: If last indexed height is 1872361 and overlap is 1500, replay 5000 means scanning from block 1865861 instead of 1870861

**Typical use cases:**
- `--replay 720` - Reprocess last ~1 day (720 blocks)
- `--replay 5000` - Reprocess last ~7 days
- `--replay 64800` - Reprocess last ~90 days

---

### `--recount`

Forces re-parsing of ALL bundle headers, even if they already exist in the database with item counts.

**Usage:**
```bash
# Direct node command
node server.js --recount --replay 5000

# With npm (use -- to pass args to script)
npm start -- --recount --replay 5000
```

**What it does:**
- Normally, if a bundle exists in DB with `item_count > 0`, it's skipped
- With `--recount`, ALL bundles are fetched from arweave.net and re-parsed
- Updates existing bundles in DB with fresh item counts
- Useful for fixing corrupted counts or validating after arweave.net downtime

**⚠️ Important:**
- `--recount` should be used WITH `--replay` to specify which blocks to recount
- Without `--replay`, it only recounts bundles in the normal scan window (overlap + new blocks)
- Fetches bundle headers from arweave.net, so use sparingly to avoid rate limits

**Typical use cases:**
- `--recount --replay 1500` - Re-verify last ~2 days of bundles
- `--recount --replay 64800` - Full recount of last 90 days (heavy operation!)

---

### Combined Examples

**Backfill 30 days without recounting:**
```bash
node server.js --replay 21600
```

**Backfill and re-verify 7 days:**
```bash
node server.js --recount --replay 5000
```

**Full recount of last 90 days (WARNING: heavy operation):**
```bash
node server.js --recount --replay 64800
```

---

## How Scanning Works

### Normal Scan (No Flags)

1. **Recount window** (last 100 blocks): Always re-parses existing bundles to verify counts
2. **Overlap window** (last 1500 blocks): Rescans for new bundles that may have appeared due to indexer lag
3. **New blocks**: Scans from last indexed height to current tip

### With `--replay 5000`

1. **Recount window** (last 100 blocks): Same as normal
2. **Extended scan** (last 1500 + 5000 = 6500 blocks): Scans wider range for new bundles
3. Still only fetches headers for bundles NOT in DB (unless `--recount` is used)

### With `--recount --replay 5000`

1. **Recount window** (last 100 blocks): Same as normal
2. **Extended scan** (last 1500 + 5000 = 6500 blocks): Scans wider range
3. **Re-parses ALL bundles** in the extended scan, even if they exist in DB

---

## Environment Variables

Configure in `.env` file:

```env
# API server port (default: 3000)
API_PORT=3000

# Database path
DB_PATH=data/Analytics.sqlite

# Arweave gateway (IMPORTANT: include /raw)
ARWEAVE_GATEWAY=https://arweave.net/raw

# GraphQL endpoint
GRAPHQL_ENDPOINT=https://arweave-search.goldsky.com/graphql

# Indexer lag safety margin (default: 0)
INDEXER_LAG_BLOCKS=0

# Run processing on server startup (default: false)
RUN_ON_STARTUP=false

# CORS: Allow localhost requests (default: false)
ALLOW_LOCALHOST=true
```

---

## Troubleshooting

### "Already running, skipping"

**Cause:** Lock file exists from previous run
**Fix:**
```bash
rm logs/cron.lock
```

### "timeout of 10000ms exceeded"

**Cause:** Gateway URL missing `/raw` or arweave.net is slow
**Fix:**
1. Check `.env` has `ARWEAVE_GATEWAY=https://arweave.net/raw`
2. Restart service after changing `.env`

### Bundle counts are 0

**Cause:** Bundle header parsing failed
**Fix:**
```bash
# Re-parse last 1500 blocks
node server.js --recount --replay 1500
```

### npm not passing flags

**Wrong:**
```bash
npm start --recount --replay 5000
```

**Correct:**
```bash
npm start -- --recount --replay 5000
```

Or use node directly:
```bash
node server.js --recount --replay 5000
```

---

## VPS Deployment

**Update code:**
```bash
cd /root/arweave-analytics-service
git pull  # or upload new files
npm install
```

**Restart service:**
```bash
# Find and kill existing process
ps aux | grep node
kill <PID>

# Start in screen
screen -S analytics
npm start
# Ctrl+A, D to detach
```

**Run manual recount:**
```bash
# SSH to VPS
ssh root@137.184.115.211

# Run recount
cd /root/arweave-analytics-service
node server.js --cron --recount --replay 5000
```

---

## Quick Reference

| Command | What It Does |
|---------|-------------|
| `npm start` | Start API server |
| `npm run cron` | Run processing once and exit |
| `node server.js --replay 5000` | Backfill 5000 blocks |
| `node server.js --recount --replay 5000` | Re-parse 5000 blocks |
| `node server.js --cron --recount --replay 1500` | One-time recount (no server) |
| `rm logs/cron.lock` | Clear stuck lock file |

