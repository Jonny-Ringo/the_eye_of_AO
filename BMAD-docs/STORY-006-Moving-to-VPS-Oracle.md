# STORY-006: Moving to VPS Oracle

## Epic
Infrastructure Migration - Oracle Services

## Story Title
Migrate Blockheight Data Source from Lua Oracle to VPS Node.js Oracle

## Priority
HIGH - Critical infrastructure upgrade

## Status
IN PROGRESS - Phase 1 Local Testing

## Story Description

As a developer, I need to migrate our blockheight data source from the existing Lua-based Oracle running on AO to the new Node.js-based Oracle running on our VPS (137.184.115.211:3001). This will significantly improve data fetch performance and reliability while maintaining identical functionality for end users.

## Business Value

- **Performance**: Dramatically faster blockheight data loading times
- **Reliability**: More stable data source with better error handling
- **Scalability**: VPS infrastructure can handle higher request volumes
- **Maintainability**: Easier to debug and update Node.js service vs Lua process
- **Cost Efficiency**: Reduces load on AO network resources

## Current State Analysis

### Existing Lua Oracle Architecture
- **Process ID**: `V5Pm1eScgJo1Ue6R0NL_qVUM53leE_B3zavwf1Z5zPk`
- **Location**: AO network (in-memory)
- **Data Access**: Via AO message passing
- **Performance**: Slower due to network latency and AO message overhead
- **Data Format**: Lua table structure synced to patch@1.0 device

### New VPS Oracle Architecture
- **Endpoint**: `http://137.184.115.211:3001`
- **Technology**: Node.js + Express + SQLite3
- **Location**: DigitalOcean VPS
- **Data Access**: RESTful HTTP API
- **Performance**: Direct HTTP calls with minimal latency
- **Data Format**: JSON responses

## API Comparison

### Current Lua Oracle (via AO)
```lua
-- Fetched via AO message passing
Send({
  Target = "V5Pm1eScgJo1Ue6R0NL_qVUM53leE_B3zavwf1Z5zPk",
  Action = "Get-Blockheights"
})

-- Response format (Lua table)
{
  DailyBlocks = {
    { date = "2026-02-22", blockHeight = 1862413, timestamp = 1771718400000 },
    { date = "2026-02-21", blockHeight = 1861693, timestamp = 1771632000000 },
    ...
  }
}
```

### New VPS Oracle (HTTP API)
```javascript
// Endpoint 1: Get daily blockheights (default: last 730 days)
GET http://137.184.115.211:3001/api/blockheights/daily
GET http://137.184.115.211:3001/api/blockheights/daily?days=365

// Response format (JSON)
{
  "success": true,
  "data": [
    {
      "date": "2026-02-22",
      "block_height": 1862413,
      "timestamp_ms": 1771718400000,
      "recorded_at_ms": 1771721000000
    },
    {
      "date": "2026-02-21",
      "block_height": 1861693,
      "timestamp_ms": 1771632000000,
      "recorded_at_ms": 1771635600000
    }
  ],
  "metadata": {
    "days_requested": 730,
    "records_returned": 730,
    "latest_date": "2026-02-22"
  }
}

// Endpoint 2: Get latest blockheight only
GET http://137.184.115.211:3001/api/blockheights/latest

// Response format (JSON)
{
  "success": true,
  "data": {
    "date": "2026-02-22",
    "block_height": 1862413,
    "timestamp_ms": 1771718400000,
    "recorded_at_ms": 1771721000000
  }
}
```

## Data Format Mapping

### Field Name Changes

| Lua Oracle Field | VPS Oracle Field | Notes |
|------------------|------------------|-------|
| `blockHeight` | `block_height` | Snake case convention |
| `timestamp` | `timestamp_ms` | More explicit naming |
| N/A | `recorded_at_ms` | New field tracking when data was recorded |

### Response Structure Changes

| Aspect | Lua Oracle | VPS Oracle |
|--------|------------|------------|
| Root structure | Array directly | Object with `success`, `data`, `metadata` |
| Date field | `date` | `date` (unchanged) |
| Block height field | `blockHeight` (camelCase) | `block_height` (snake_case) |
| Timestamp field | `timestamp` | `timestamp_ms` |
| Error handling | Lua error messages | JSON error object with `success: false` |

## Files Requiring Updates

### 1. Frontend API Layer
**File**: `dev/api.js`

**Current Implementation**:
```javascript
// Line 70-125: fetchBlockHistory()
export async function fetchBlockHistory() {
  const result = await ao.dryrun({
    process: BLOCK_TRACKING_PROCESS,
    tags: [
      { name: "Action", value: "Get-Daily-Blocks" },
      { name: "Days", value: "365" }
    ]
  });

  return JSON.parse(result.Messages[0].Data);
}
```

**Required Changes**:
- Replace AO message passing with direct HTTP fetch to VPS endpoint
- Update response parsing to handle new JSON structure
- Map `block_height` → `blockHeight` for backward compatibility
- Add error handling for HTTP failures

**New Implementation**:
```javascript
// Updated fetchBlockHistory() function
export async function fetchBlockHistory(days = 730) {
  try {
    const response = await fetch(
      `http://137.184.115.211:3001/api/blockheights/daily?days=${days}`
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch blockheight data');
    }

    // Transform VPS Oracle format to match existing Lua Oracle format
    return result.data.map(block => ({
      date: block.date,
      blockHeight: block.block_height,  // Map snake_case to camelCase
      timestamp: block.timestamp_ms
    }));
  } catch (error) {
    console.error('[API] Failed to fetch block history:', error);
    throw error;
  }
}
```

### 2. Configuration Constants
**File**: `dev/config.js`

**Current**:
```javascript
// Line 13-14
export const BLOCK_TRACKING_PROCESS = 'V5Pm1eScgJo1Ue6R0NL_qVUM53leE_B3zavwf1Z5zPk';
```

**Required Changes**:
- Add new VPS Oracle endpoint constant
- Keep old process ID for fallback/migration period

**New Constants**:
```javascript
// Blockheight Oracle Endpoints
export const VPS_ORACLE_ENDPOINT = 'http://137.184.115.211:3001';
export const BLOCKHEIGHT_API = `${VPS_ORACLE_ENDPOINT}/api/blockheights`;

// Legacy Lua Oracle (deprecated - kept for fallback)
export const BLOCK_TRACKING_PROCESS = 'V5Pm1eScgJo1Ue6R0NL_qVUM53leE_B3zavwf1Z5zPk';

// Oracle configuration
export const USE_VPS_ORACLE = true; // Feature flag for migration
```

### 3. Utility Functions
**File**: `dev/utils.js`

**Functions Affected**:
- `findBlockNearDate()` (Line 63-75)
- `getDailyPeriods()` (Line 116-151)
- `getWeeklyPeriods()` (Line 159-198)

**Required Changes**:
- Update to handle `block_height` field name
- Ensure date matching logic works with new timestamp format
- No functional changes needed if transformation happens in `api.js`

**Verification**:
```javascript
// These functions should work unchanged if api.js transforms the data correctly
// Test that blockHeight field is available after transformation
console.assert(blockData[0].hasOwnProperty('blockHeight'), 'blockHeight field missing');
```

### 4. Main Application Initialization
**File**: `dev/index.js`

**Current Implementation**:
```javascript
// Line 212-216: Initial data fetch
const [networkInfo, blockData] = await Promise.all([
  fetchNetworkInfo(),
  fetchBlockHistory()
]);

window.currentNetworkInfo = networkInfo;
window.currentBlockData = blockData;
```

**Required Changes**:
- Update to use new VPS Oracle endpoint
- Add error handling for VPS connection failures
- Consider adding fallback to Lua Oracle during migration

**Enhanced Implementation**:
```javascript
// Line 212-227: Enhanced with VPS Oracle
const [networkInfo, blockData] = await Promise.all([
  fetchNetworkInfo(),
  fetchBlockHistory(730) // Fetch 2 years of data (730 days)
]);

// Validate blockheight data structure
if (!blockData || blockData.length === 0) {
  console.error('[Init] No blockheight data received from VPS Oracle');
  // Could implement fallback to Lua Oracle here if needed
  throw new Error('Failed to initialize: No blockheight data available');
}

window.currentNetworkInfo = networkInfo;
window.currentBlockData = blockData;

console.log(`[Init] Loaded ${blockData.length} days of blockheight data`);
console.log(`[Init] Latest block: ${blockData[0].blockHeight} (${blockData[0].date})`);
```

### 5. Chart Components
**File**: `dev/charts.js`

**Functions Affected**:
- `updateArweaveTransactionsData()` (Line 941-967)

**Current Implementation**:
```javascript
// Line 945-947
const currentHeight = window.currentNetworkInfo
  ? window.currentNetworkInfo.height
  : null;
```

**Required Changes**:
- Verify `window.currentBlockData` uses transformed field names
- No changes needed if `api.js` handles transformation

**Validation**:
```javascript
// Add validation logging
console.log('[Charts] Current block data sample:',
  window.currentBlockData?.slice(0, 3));

// Ensure blockHeight field exists
if (window.currentBlockData?.[0]?.blockHeight === undefined) {
  console.error('[Charts] Invalid block data format - missing blockHeight field');
}
```

## Implementation Plan

### Phase 1: Local Testing (Development Environment)

**Objective**: Test VPS Oracle integration locally before deployment

**Steps**:

1. **Update Configuration** (`dev/config.js`)
   - Add VPS Oracle endpoint constant
   - Set `USE_VPS_ORACLE = true` for testing
   - Keep legacy constants for fallback

2. **Update API Layer** (`dev/api.js`)
   - Refactor `fetchBlockHistory()` to fetch from VPS endpoint
   - Add data transformation layer (snake_case → camelCase)
   - Implement error handling and logging
   - Add timeout handling (10s timeout recommended)

3. **Test Data Transformation**
   - Verify field mapping works correctly
   - Check date format consistency
   - Validate timestamp values match expectations

4. **Update CORS on VPS Oracle**
   - Temporarily enable `ALLOW_LOCALHOST=true` in VPS `.env`
   - Test local development can fetch from VPS
   - Verify no CORS errors in browser console

5. **Run Local Tests**
   ```bash
   # Start local dev server
   npm run dev

   # Verify in browser console:
   # 1. No CORS errors
   # 2. Blockheight data loads successfully
   # 3. Charts populate correctly
   # 4. Performance is noticeably faster
   ```

6. **Visual Verification**
   - Load Eye of AO dashboard locally
   - Verify all charts display correctly
   - Check date labels match expected format
   - Confirm no visual regressions

### Phase 2: Production Deployment

**Objective**: Deploy to production with VPS Oracle as primary data source

**Steps**:

1. **Disable Localhost CORS on VPS**
   - Set `ALLOW_LOCALHOST=false` in VPS `.env`
   - Restart VPS Oracle service
   - Verify only `eye-of-ao.*` domains can access

2. **Update Production Frontend**
   - Deploy updated `api.js` with VPS Oracle integration
   - Deploy updated `config.js` with endpoint constants
   - Monitor deployment for errors

3. **Production Testing**
   - Load production Eye of AO dashboard
   - Verify blockheight data loads from VPS
   - Check browser console for errors
   - Compare load times (should be significantly faster)

4. **User Acceptance Testing**
   - Test from multiple browsers
   - Verify charts display identical data to Lua Oracle version
   - Confirm date ranges work correctly
   - Check for any visual differences

5. **Performance Monitoring**
   - Measure page load time improvement
   - Monitor VPS Oracle response times
   - Check for any API errors in VPS logs
   - Verify database backups are running

6. **Cleanup (Post-Migration)**
   - Remove Lua Oracle references after successful migration
   - Update documentation
   - Archive old Lua Oracle code for reference

## Testing Checklist

### Data Integrity Tests

- [ ] Blockheight values match between Lua Oracle and VPS Oracle
- [ ] Date fields are identical (YYYY-MM-DD format)
- [ ] Timestamp values are accurate (milliseconds since epoch)
- [ ] Historical data completeness (verify no gaps)
- [ ] Latest blockheight updates correctly
- [ ] Data transformation (snake_case → camelCase) works correctly

### API Tests

- [ ] `GET /api/blockheights/daily` returns correct format
- [ ] `GET /api/blockheights/daily?days=365` respects days parameter
- [ ] `GET /api/blockheights/latest` returns latest block only
- [ ] HTTP error codes are handled gracefully (500, 503, etc.)
- [ ] CORS allows `eye-of-ao.*` domains
- [ ] CORS blocks unauthorized domains
- [ ] API responds within acceptable time (< 1s for 730 days)

### Frontend Integration Tests

- [ ] `fetchBlockHistory()` returns data in expected format
- [ ] `window.currentBlockData` is populated correctly
- [ ] Charts display data correctly
- [ ] Date labels on charts match blockheight dates
- [ ] Time range filters work correctly (1W, 1M, 3M, 6M, 1Y, ALL)
- [ ] No console errors during data fetch
- [ ] Loading states work correctly
- [ ] Error states display user-friendly messages

### Performance Tests

- [ ] Initial page load time is faster than Lua Oracle
- [ ] Blockheight data fetches in < 1 second
- [ ] No noticeable lag when switching time ranges
- [ ] VPS Oracle handles multiple concurrent requests
- [ ] Database queries execute efficiently (< 100ms)

### User Experience Tests

- [ ] No visual differences from user perspective
- [ ] Charts populate smoothly
- [ ] Date ranges function identically
- [ ] No data gaps or missing information
- [ ] Error messages are helpful if VPS is down

## Rollback Plan

If issues arise during migration:

### Immediate Rollback (Emergency)

1. **Revert API Layer**
   ```javascript
   // In dev/api.js - switch back to Lua Oracle
   export const USE_VPS_ORACLE = false;
   ```

2. **Redeploy Frontend**
   - Deploy previous version from git
   - Verify Lua Oracle still functional

3. **Monitor**
   - Check that data loads correctly
   - Verify no errors in console

### Gradual Rollback (Non-Emergency)

1. **Implement Feature Flag**
   ```javascript
   // In dev/config.js
   export const USE_VPS_ORACLE = localStorage.getItem('use_vps_oracle') === 'true';
   ```

2. **Test with Subset of Users**
   - Enable VPS Oracle for internal team only
   - Collect feedback
   - Fix issues before broader rollout

3. **Monitor Both Sources**
   - Keep Lua Oracle operational during transition
   - Compare data between sources
   - Ensure parity before full cutover

## Success Criteria

### Functional Requirements
✅ All blockheight data displays correctly
✅ Date ranges match exactly with Lua Oracle version
✅ Charts populate with identical visual output
✅ No data gaps or inconsistencies
✅ Error handling works gracefully

### Performance Requirements
✅ Page load time improves by at least 50%
✅ Blockheight data fetches in < 1 second
✅ VPS Oracle responds to API calls in < 500ms
✅ No performance degradation under normal load

### Non-Functional Requirements
✅ CORS security properly configured
✅ VPS Oracle service runs reliably (99%+ uptime)
✅ Database backups run automatically
✅ Logs capture all API activity
✅ No breaking changes for end users

## Environment Variables

### VPS Oracle (137.184.115.211)
**File**: `arweave-blockheight-tracker/.env`

```env
API_PORT=3001
DB_PATH=data/BlockHeights.sqlite
ARWEAVE_GATEWAY=https://arweave.net
NODE_ENV=production
BACKUP_RETENTION_COUNT=24
ALLOW_LOCALHOST=false              # Set to 'true' for local development testing
DEFAULT_QUERY_DAYS=730             # Return 2 years of data by default
```

### Frontend Configuration
**File**: `dev/config.js`

```javascript
export const VPS_ORACLE_ENDPOINT = 'http://137.184.115.211:3001';
export const BLOCKHEIGHT_API = `${VPS_ORACLE_ENDPOINT}/api/blockheights`;
export const USE_VPS_ORACLE = true;  // Feature flag
```

## Risks & Mitigations

### Risk 1: VPS Downtime
**Impact**: Users cannot access blockheight data
**Probability**: Low (VPS has 99% uptime SLA)
**Mitigation**:
- Implement fallback to Lua Oracle during transition
- Set up monitoring alerts for VPS downtime
- Keep Lua Oracle operational for 30 days post-migration

### Risk 2: Data Format Incompatibility
**Impact**: Charts break or display incorrectly
**Probability**: Medium (different field naming conventions)
**Mitigation**:
- Implement transformation layer in `api.js`
- Extensive testing before production deployment
- Feature flag to quickly revert if needed

### Risk 3: CORS Issues
**Impact**: Browsers block API requests
**Probability**: Low (CORS properly configured)
**Mitigation**:
- Test CORS from all production domains
- Add proper origin patterns to allowlist
- Monitor browser console for CORS errors

### Risk 4: Performance Degradation
**Impact**: Slower data loading than expected
**Probability**: Low (VPS should be faster)
**Mitigation**:
- Monitor API response times
- Optimize database queries if needed
- Add caching layer if response times exceed 1s

### Risk 5: Data Inconsistency
**Impact**: Different blockheight values between sources
**Probability**: Low (same Arweave source)
**Mitigation**:
- Compare VPS Oracle data with Lua Oracle
- Verify historical data migration was accurate
- Use CLI tools to validate database integrity

## Post-Migration Tasks

### Immediate (Day 1-7)
- [ ] Monitor VPS Oracle logs for errors
- [ ] Track API response times
- [ ] Verify database backups are running
- [ ] Check for any user-reported issues
- [ ] Monitor VPS resource usage (CPU, memory, disk)

### Short-term (Week 2-4)
- [ ] Analyze performance improvements
- [ ] Document any issues encountered
- [ ] Update internal documentation
- [ ] Train team on VPS Oracle CLI tools
- [ ] Optimize database queries if needed

### Long-term (Month 2+)
- [ ] Decommission Lua Oracle
- [ ] Remove legacy code references
- [ ] Archive Lua Oracle for historical reference
- [ ] Update architecture diagrams
- [ ] Create runbook for VPS Oracle maintenance

## Additional Documentation

### VPS Oracle API Documentation
See: `arweave-blockheight-tracker/README.md`

### CLI Management Tools
See: `arweave-blockheight-tracker/README.md` - CLI Management Tool section

### Architecture Diagram
See: `arweave-blockheight-tracker/README.md` - Architecture Summary section

### Migration Scripts
See: `arweave-blockheight-tracker/migrate-historical-data.js`

## Related Stories
- STORY-001: Initial Eye of AO dashboard development
- STORY-005: Arweave Analytics Service integration
- STORY-007: Performance optimization and caching (future)

## Definition of Done

✅ VPS Oracle serves blockheight data via HTTP API at 137.184.115.211:3001
✅ Frontend successfully fetches data from VPS Oracle
✅ Data transformation layer maps VPS format to existing frontend format
✅ All charts display correctly with no visual changes
✅ Page load performance improves by at least 50%
✅ CORS security properly restricts access to authorized domains
✅ No console errors or warnings in production
✅ Comprehensive testing completed (data integrity, API, frontend, performance, UX)
✅ Rollback plan tested and documented
✅ Team trained on VPS Oracle management
✅ Monitoring and alerting configured
✅ Documentation updated
✅ Lua Oracle deprecated (after 30-day grace period)

## Notes

- Keep localhost testing enabled on VPS Oracle during development phase
- The VPS Oracle uses screen session named "oracle" for service management
- Database backups stored in `arweave-blockheight-tracker/backups/` (24-hour retention)
- Cron job runs hourly to update blockheight data
- SQLite database uses WAL mode for concurrent access safety

## Estimated Effort
**Story Points**: 5
**Time Estimate**: 1-2 days (including testing and deployment)

## Assigned To
[Developer Name]

## Sprint
Sprint XX - Infrastructure Migration

---

**Created**: 2026-02-28
**Last Updated**: 2026-02-28
**Version**: 1.0
