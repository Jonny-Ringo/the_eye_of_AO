# STORY-005 — Arweave Transaction Analytics

## Summary

Replace one “Coming Soon” chart with a **stacked bar chart** for **Arweave bundle activity**, but **measured as total bundle item count per day** (not just bundle tx count), broken down by source.

Because parsing item counts from bundles is not feasible client-side at scale, this story introduces a tiny backend **Bundle Indexer** service that:

* discovers new bundle txids,
* computes `item_count` once per txid by parsing the **ANS-104 bundle header** (via range request),
* stores results, and
* serves blazing-fast JSON to the frontend.

The chart UI remains: **1W / 1M / 3M** + **Fullscreen**, defaulting to **1W**.

---

## Goals

* Display **daily totals of bundle items** over the selected range (up to **3M / ~90 days**).
* Break totals into **stacked, color-coded segments** representing bundle items attributed to:

  1. **Redstone Oracle** (`Bundler-App-Name=Redstone`)
  2. **ArDrive uploads** (`Bundler-App-Name=ArDrive`)
  3. **AO messages** (`Data-Protocol=ao`)
  4. **AR.IO Network** (`Bundler-App-Name=AR.IO Network`)
  5. **Other** (optional)
* Avoid browser waterfalls / gateway throttling by computing item counts **server-side**.
* Keep frontend data load **fast** via a single API call returning compact JSON.

---

## Non-Goals

* No per-item drilldown UI in this story (txid → list of items).
* No real-time streaming updates; batch refresh is sufficient.
* No guarantee of perfect source attribution if tag taxonomy changes; we store the best-known attribution.

---

## User Experience

### Placement

* Replace an existing **“Coming Soon”** analytics tile/chart with **“Arweave Transaction Analytics”**.

### View Options (Wired Up)

* Range selector must support:

  * **1W** (default on first open)
  * **1M**
  * **3M**
* **Fullscreen** mode must work for this chart (same behavior as other charts).

### Default Behavior

* On first load/open, the chart must default to **1W** to keep initial data construction light.

### Chart Type

* **Stacked vertical bars** (one bar per day).
* X-axis: date (daily buckets)
* Y-axis: transaction count
* Stacks: Redstone / ArDrive / AO / AR.IO / Other

### Tooltip

On hover for a day:

* Date
* Total
* Each source count
* Other

### Legend

* Color key for each stack segment.
* (Nice-to-have) Click to toggle a segment on/off.

### States

* Loading: skeleton or spinner
* Empty: “No transactions in selected range”
* Error: “Failed to load Arweave transaction analytics” + retry

---

## Data Requirements

### High-level

The frontend must not fetch and parse bundle headers directly. Instead it consumes a backend-produced dataset where each bundle txid has a computed `item_count`.

### Time Range

* Range selector: **1W / 1M / 3M**
* Bucketing: **daily**

### Source attribution

We identify bundles by tags (examples):

* Redstone: `Bundler-App-Name=Redstone`
* ArDrive: `Bundler-App-Name=ArDrive`
* AO: `Data-Protocol=ao`
* AR.IO: `Bundler-App-Name=AR.IO Network`

### Backend refresh cadence

* Indexer runs on a **15-minute schedule** (cron/job runner), restarting each run to reduce long-lived memory leak risk.

---

## GraphQL Queries (Indexer)

The indexer uses GraphQL only for **discovering relevant bundle txids** and basic metadata (height/timestamp + tags). The actual `item_count` comes from parsing the bundle header.

### 1) Discover bundle txids (per source)

Example (Redstone):

```graphql
query {
  transactions(
    tags: [{ name: "Bundler-App-Name", values: ["Redstone"] }]
    block: { min: <MIN_HEIGHT>, max: <MAX_HEIGHT> }
    sort: HEIGHT_ASC
  ) {
    edges {
      node {
        id
        block { height timestamp }
        tags { name value }
      }
    }
  }
}
```

Repeat with the relevant tag filters for ArDrive / AO / AR.IO.

### 2) Total bundles (optional)

If you still want to show “bundle tx count” somewhere, you can also query `count`, but the chart’s primary metric is **sum(item_count)**.

---

## Bundle Header Parsing (Indexer)

For each discovered `txid` not yet computed:

1. **Fetch only the bundle header** using an HTTP **Range request** (small payload).
2. Parse **ANS-104** header.
3. Derive `item_count`.
4. Persist result.

---

## Data Model

Chart consumes an array of daily buckets:

```ts
type ArweaveBundleItemsBucket = {
  date: string;   // YYYY-MM-DD
  total_items: number;
  redstone_items: number;
  ardrive_items: number;
  ao_items: number;
  ario_items: number;
  other_items: number;
};

```

---

## Performance Plan (Primary Focus)

### Frontend

* **Single API call** to fetch the already-aggregated daily series.
* Default to **1W** on open to keep UI instantly responsive.

### Backend (Indexer)

Since item counts require bundle header inspection, performance is achieved by doing it **once per txid**, then serving cached results.

**Must-do**

1. **Cron-style runs every 15 minutes**

   * Each run discovers new bundle txids since the last processed height/time.
   * Each run exits cleanly.

2. **Idempotent processing**

   * Store `computed_at`; if a txid exists with `item_count`, skip.

3. **Concurrency controls**

   * Limit header fetch/parse concurrency to avoid gateway rate limits.

4. **Incremental indexing**

   * Track `last_indexed_height` (or timestamp) per source.

**Nice-to-have**

* Backfill job for historical ranges (one-time) separate from 15-min cron.

---

## Acceptance Criteria

### Functional — Chart

* [ ] A “Coming Soon” chart is replaced by **Arweave Transaction Analytics** (bundle items)
* [ ] Range selector supports **1W / 1M / 3M** and defaults to **1W** on first open
* [ ] **Fullscreen** works for this chart
* [ ] Displays **stacked bars** where values represent **bundle item counts per day**
* [ ] Stacks include Redstone / ArDrive / AO / AR.IO (+ Other if enabled)
* [ ] Tooltip shows date, total_items, and per-segment item counts

### Functional — Backend

* [ ] Indexer discovers new bundle txids via GraphQL and stores txid + height + timestamp
* [ ] Indexer computes and stores `item_count` by parsing **ANS-104 header** (range request)
* [ ] Indexer runs on a **15-minute cron** schedule and is safe to rerun (idempotent)
* [ ] Backend exposes an API that returns fast JSON for the frontend (no browser waterfalls)

## Robustness

* [ ] Loading state
* [ ] Error state with retry
* [ ] Empty state
* [ ] “Other” never goes negative (clamped)

### Performance

* [ ] Uses concurrency-limited parallel fetching
* [ ] Uses caching for day boundaries and/or counts to keep the chart responsive

---

## Implementation Tasks

### A) Backend — Bundle Indexer Service

1. **Storage**: Create a table/kv collection:

   * `txid` (primary key)
   * `height`
   * `timestamp`
   * `bundler_app_name` (optional)
   * `source` (enum or derived: redstone/ardrive/ao/ario/other)
   * `item_count`
   * `computed_at`

2. **Discovery**: Poll GraphQL for new bundle txs

   * By block range (min/max) or time window
   * Persist `txid + height + timestamp + tags`

3. **Compute itemCount** (once per txid)

   * Fetch just bundle header (HTTP Range)
   * Parse **ANS-104** header
   * Persist `item_count + computed_at`

4. **Scheduler**

   * Run every **15 minutes** via cron/job runner
   * Ensure process exits after completion

5. **API**

   * Expose an endpoint returning aggregated daily series for a requested range:

     * `range=1W|1M|3M`
   * Response: compact JSON list that the frontend can parse directly.

### B) Frontend — Chart

1. **UI**: Replace “Coming Soon” tile with new chart component.
2. **Range selector**: Wire up **1W / 1M / 3M**; default to **1W**.
3. **Fullscreen**: Ensure fullscreen works like other charts.
4. **Fetch**: Call backend API; no per-tx or per-day GraphQL queries in the browser.
5. **Render**: Stacked bar chart using `*_items` series + tooltip + legend.
6. **States**: loading/error/empty.

---

## Open Notes / Assumptions

* Some tag groups could overlap; we accept this and clamp “Other” at 0 if needed.
* Block-height boundary resolution exists or will be implemented; cache is strongly recommended.

---

## Story Metadata

* **ID**: STORY-005
* **Title**: Arweave Transaction Analytics
* **Type**: Feature
* **Priority**: High (replaces missing analytics)
