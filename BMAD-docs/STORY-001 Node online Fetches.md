# STORY-001 — Optimize Node Uptime: Server‑sourced List + Client Cache

**Role:** Scrum Master • **Owner:** Platform/FE • **Status:** Ready for dev • **Target Release:** M1 (next minor)
**Why:** Remove need to redeploy the frontend to update the node list; accelerate online node updates and decrease load.

---

## 1) Problem & Context

* Today the **frontend bundles a static list of nodes** and sends **one bulk request** to check their uptime, then renders statuses.
* To update the list, we must **ship a new frontend** and **update the server list**—double change, risky and slow.
* Goal: **server becomes the source of truth for the node list**; frontend fetches it at runtime and **caches locally** with proper revalidation.

---

## 2) User Story & Goals

**As an operator/analyst**, when I open the Nodes page, I want the app to **fetch the authoritative node list from the server** and **show fresh statuses quickly**, so that updating nodes requires **only a server‑side list change** (no frontend redeploy).

### Success Criteria (Measurable)

* Updating the server list reflects in the UI **without frontend redeploy**.
* First paint of node cards < **1s** (with cached list) and < **2s** cold.
* Status freshness: last probe time displayed; p95 age ≤ **15s** (configurable).
* Reduce Nodes page **payload size** ≥ **30%** vs current (no embedded list).

---

## 3) Scope

### In

* Fetch node list from server on page load.
* Local cache (IndexedDB or localStorage) with **ETag**/**Last‑Modified** revalidation.
* Split probing: quickly display **online** nodes first; lazy probe offline/unknown.
* Feature flag to switch between **bundled** vs **server‑sourced** list during rollout.

### Out (Future)

* Push updates (SSE/WebSocket) for live status.
* Admin UI to edit node list.

---

## 4) API Contracts (Internal)

> No public API. Endpoints are internal UI ↔ Node service contracts.

### 4.1 GET `/api/nodes`

Returns the **authoritative list** of nodes to probe.

* **Headers:** `Cache-Control: max-age=300, stale-while-revalidate=60`
  Supports `ETag` and `If-None-Match` for 304.
* **200 Body (example):**

```json
{
  "version": "2025-10-26",
  "items": [
    { "id": "n-1", "name": "Gateway A", "url": "https://node-a.example", "region": "ap-syd" },
    { "id": "n-2", "name": "Gateway B", "url": "https://node-b.example", "region": "us-west" }
  ]
}
```

* **304:** when up‑to‑date.

### 4.2 POST `/api/nodes/status` (batch)

Given a list of node IDs or URLs, returns **current uptime/health**.

* **Request:**

```json
{ "ids": ["n-1", "n-2"], "fast": true }
```

* **200 Response:**

```json
{
  "checkedAt": "2025-10-26T05:01:00Z",
  "items": [
    { "id": "n-1", "status": "online", "latencyMs": 128, "height": 123456, "lastOk": "2025-10-26T05:00:58Z" },
    { "id": "n-2", "status": "offline", "latencyMs": null, "height": null, "lastOk": "2025-10-26T04:57:10Z" }
  ]
}
```

* **Notes:** `fast=true` may use cache/async probe results; omit for full probe.

> **Alternative (optional):** `GET /api/nodes/status?ids=n-1,n-2&fast=1` for idempotent reads.

---

## 5) Frontend Behavior

1. **On page load**:

   * Read cached `nodes` from IndexedDB/localStorage.
   * Kick off `GET /api/nodes` with `If-None-Match`.
   * If **cache hit** → render immediately, annotate "from cache".
   * If **200** → update cache and render.
2. **Status refresh**:

   * Call `POST /api/nodes/status` with the latest node IDs.
   * Render **online** nodes first (fast path), then offline/unknown as results arrive.
3. **Revalidation**:

   * On **tab focus** or every **60s**, re‑check `ETag` for `/api/nodes`.
4. **Failure states**:

   * If `/api/nodes` fails and no cache → show inline error and retry with backoff.

---

## 6) Caching Strategy

* **Client**: IndexedDB (preferred) or localStorage fallback.
* **Validation**: `ETag` + `If-None-Match`, `Cache-Control: max-age=300, stale-while-revalidate=60`.
* **Server**: keep node list in in‑memory store backed by file/DB; bump `ETag` on change.
* **TTL knobs**: `NODES_LIST_TTL=300`, `NODES_STALE_WHILE_REVALIDATE=60`.

---

## 7) Data Model

```ts
// FE cache shape
interface NodesCache {
  version: string;      // date or semver of list
  etag: string;         // for If-None-Match
  items: NodeItem[];
  cachedAt: string;
}

interface NodeItem {
  id: string;
  name: string;
  url: string;
  region?: string;
}

interface NodeStatusItem {
  id: string;
  status: 'online' | 'offline' | 'unknown';
  latencyMs?: number | null;
  height?: number | null;
  lastOk?: string | null;
}
```

---

## 8) Non‑Functional Requirements

* **Perf**: p50 status fetch < 300ms (fast path), p95 < 1.2s (full probe).
* **Availability**: `/api/nodes` uptime > 99.9%.
* **Security**: CORS limited to UI origin; input validation on `ids`.
* **Observability**: metrics for `nodes.list.200/304`, `nodes.status.latency`, cache hit rate.

---

## 9) Acceptance Criteria

* [ ] Frontend no longer ships a bundled node list.
* [ ] UI fetches `/api/nodes` at runtime and caches with `ETag`.
* [ ] Updating server list changes UI contents **without FE deploy**.
* [ ] Online nodes render within **<1s** when cache present.
* [ ] Offline/unknown nodes render progressively as probes complete.
* [ ] Feature flag `USE_SERVER_NODES_LIST` can toggle behavior.
* [ ] Basic metrics visible in dashboard.

---

## 10) Test Plan

**Unit**:

* Cache read/write, ETag revalidation, error fallbacks.

**Integration**:

* `/api/nodes` 200/304 path; `/api/nodes/status` with mixed responses.

**E2E**:

* First load (cold), warm load (cache), server list update reflected without deploy.

**Load**:

* Batch status probes (N nodes) with concurrency limits; back‑pressure.

---

## 11) Tasks & Estimation (T‑shirt)

**Backend**

* [ ] Implement `/api/nodes` with ETag + cache headers (S)
* [ ] Implement `/api/nodes/status` batch probe (M)
* [ ] Add in‑memory store + editable source (JSON/DB) (S)
* [ ] Metrics & logs (S)

**Frontend**

* [ ] Replace static list with runtime fetch + local cache (M)
* [ ] Progressive render (online first) (S)
* [ ] Revalidation on focus + interval (S)
* [ ] Feature flag + settings toggle (S)

**Ops**

* [ ] Rollout plan, dashboards, alerts (S)

---

## 12) Rollout Plan

1. Ship toggled behind `USE_SERVER_NODES_LIST=false` (default).
2. Enable in **dev**, verify metrics & cache behavior.
3. Enable in **staging**, update server list and watch UI sync.
4. Gradual **prod** enablement; monitor error rate & latency.
5. Remove static list code paths once stable.

---

## 13) Risks & Mitigations

* **Server bottleneck on status probes** → limit concurrency, add caching of results, consider queue.
* **Stale client cache** → `stale-while-revalidate` + focus revalidation.
* **Inconsistent IDs** → validate node items and enforce unique IDs on server.

---

**Definition of Done**

* ACs met, tests passing, dashboards live, feature flag defaulted ON in prod.
