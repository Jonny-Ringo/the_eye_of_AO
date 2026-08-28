# VPS Oracle Troubleshooting Guide

## Current Issue: Empty Database

The API endpoint returns empty data despite expecting:
1. Historical data from migration (Feb 22, 2026 backup)
2. Recent blockheight recorded at UTC 00:00

```json
{
    "success": true,
    "data": [],
    "metadata": {
        "days_requested": 730,
        "records_returned": 0,
        "latest_date": null
    }
}
```

## Diagnostic Steps

### 1. Check Database File Exists

SSH into VPS and verify database file:

```bash
ssh root@137.184.115.211
cd /root/arweave-blockheight-tracker
ls -la data/
```

**Expected output**: `BlockHeights.sqlite` file should exist

**If missing**: Database was never created. Run manual cron to initialize:
```bash
npm run cron
```

### 2. Check Database Contents

Use the CLI tool to inspect data:

```bash
cd /root/arweave-blockheight-tracker

# Check if any daily blocks exist
node cli.js last

# List recent entries
node cli.js list --days 30

# Check for date gaps
node cli.js verify
```

**Expected output**: Should show records from 2026-02-22 and earlier (from migration)

**If empty**: Migration wasn't run on VPS, only locally

### 3. Verify Migration Was Run on VPS

Check if the backup file exists on VPS:

```bash
ls -la /root/arweave-blockheight-tracker/../backups/
# Or check wherever you uploaded the backup file
```

**If backup file is missing**: Need to transfer it to VPS first

**If backup file exists but database empty**: Run migration:
```bash
cd /root/arweave-blockheight-tracker
node migrate-historical-data.js
```

### 4. Check Cron Job Configuration

Verify cron is set up:

```bash
crontab -l
```

**Expected output**: Should show hourly cron entry:
```
0 * * * * cd /root/arweave-blockheight-tracker && /usr/bin/node server.js --cron >> logs/cron.log 2>&1
```

**If missing**: Add cron job:
```bash
crontab -e
# Add the line above
```

### 5. Check Recent Cron Executions

Review diagnostic logs:

```bash
tail -50 /root/arweave-blockheight-tracker/logs/diagnostics.log
```

**Look for**:
- `[Job] Starting blockheight recording...`
- `[Job] ✓ Daily block recorded for YYYY-MM-DD`
- `[Job] Hourly check completed successfully`
- Any error messages

### 6. Check Cron Log for Errors

```bash
tail -50 /root/arweave-blockheight-tracker/logs/cron.log
```

**Look for**:
- Permission denied errors
- Module not found errors
- Database locked errors

### 7. Manually Run Cron Job

Test the cron job manually to see if it works:

```bash
cd /root/arweave-blockheight-tracker
npm run cron
```

**Expected output**:
```
[Job] Starting blockheight recording...
[Job] Current UTC time: 2026-02-28 XX:00:00
[Job] Fetched block height: XXXXXXX
[Job] Hourly check recorded
[Job] Hourly check completed successfully
```

Then check if data was written:
```bash
node cli.js last
```

### 8. Check Database Permissions

Verify the data directory is writable:

```bash
ls -la /root/arweave-blockheight-tracker/
```

**Expected**: `data/` directory should exist and be owned by the user running the cron job (usually root)

**If permission issues**:
```bash
chmod 755 /root/arweave-blockheight-tracker/data
chmod 644 /root/arweave-blockheight-tracker/data/BlockHeights.sqlite
```

### 9. Check .env Configuration

Verify database path matches actual location:

```bash
cat /root/arweave-blockheight-tracker/.env
```

**Expected**:
```env
DB_PATH=data/BlockHeights.sqlite
```

**If path is absolute**: Make sure it points to correct location

## Quick Fix Commands

### If Migration Wasn't Run on VPS

1. **Transfer backup file to VPS** (from local machine):
```bash
# From Windows
scp "C:\Users\User\Desktop\AO_Projects_Master\The_Eye\dev\backups\Blockheights backup 2-22-2026.txt" root@137.184.115.211:/root/arweave-blockheight-tracker/../backups/
```

2. **Run migration on VPS**:
```bash
# On VPS
cd /root/arweave-blockheight-tracker
node migrate-historical-data.js
```

3. **Verify data imported**:
```bash
node cli.js list --days 5
```

### If Cron Never Ran

1. **Run manual cron to initialize**:
```bash
cd /root/arweave-blockheight-tracker
npm run cron
```

2. **Verify it worked**:
```bash
node cli.js last
```

3. **Set up crontab if missing**:
```bash
crontab -e
# Add this line:
# 0 * * * * cd /root/arweave-blockheight-tracker && /usr/bin/node server.js --cron >> logs/cron.log 2>&1
```

### If Database File Missing Entirely

1. **Create directories**:
```bash
mkdir -p /root/arweave-blockheight-tracker/data
mkdir -p /root/arweave-blockheight-tracker/logs
mkdir -p /root/arweave-blockheight-tracker/backups
```

2. **Initialize database**:
```bash
npm run cron
```

## Common Issues and Solutions

### Issue: "Cannot find module"
**Cause**: node_modules not installed on VPS
**Fix**:
```bash
cd /root/arweave-blockheight-tracker
npm install
```

### Issue: "EACCES: permission denied"
**Cause**: Wrong file permissions
**Fix**:
```bash
chown -R root:root /root/arweave-blockheight-tracker
chmod -R 755 /root/arweave-blockheight-tracker
```

### Issue: "database is locked"
**Cause**: Multiple processes trying to access database
**Fix**:
```bash
# Check for stale lock file
rm -f /root/arweave-blockheight-tracker/logs/cron.lock
```

### Issue: "SQLITE_CANTOPEN: unable to open database file"
**Cause**: Data directory doesn't exist
**Fix**:
```bash
mkdir -p /root/arweave-blockheight-tracker/data
```

## Verification After Fix

Once you've resolved the issue, verify everything works:

1. **Check database has data**:
```bash
node cli.js list --days 5
```

2. **Test API endpoint** (from local machine):
```bash
curl http://137.184.115.211:3001/api/blockheights/daily?days=5
```

3. **Check logs are being written**:
```bash
tail -f /root/arweave-blockheight-tracker/logs/diagnostics.log
```

4. **Verify backups are being created**:
```bash
ls -la /root/arweave-blockheight-tracker/backups/
```

## Contact Developer

If issues persist after following this guide, check:
- Server is actually running: `ps aux | grep node`
- Port 3001 is open: `netstat -tulpn | grep 3001`
- Firewall isn't blocking: `ufw status`
