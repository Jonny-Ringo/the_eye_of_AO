# The Eye of AO — Architecture (Current State & Near‑Term)

> Source inputs: flattened code bundle (`flattened-codebase.xml`), team notes, and the PRD (Oct 2025). This captures the **existing system design** and the **near‑term architecture plan**. Owner fill‑ins are clearly marked where the bundle lacks explicit identifiers.

---

## 1) Summary

**Purpose:** Document how The Eye of AO is put together today (browser UI + Node services + AO Lua processes) and outline the key constraints, interfaces, and operational model so we can safely extend it.

**High‑level:**

* **UI:** Static HTML/JS, fetches JSON from internal Node services.
* **Middle‑tier:** One or more **Node.js services** act as aggregators/transformers, shaping AO process outputs for the UI.
* **On‑chain:** **Lua‑based AO processes** expose read endpoints; AO/Arweave is the source of truth.
* **Public API/SDK:** **None yet** (internal endpoints only).

---

## 2) Context & Scope

* **In scope:** Current components, data flows, internal interfaces, environments, reliability/security/perf posture, and near‑term architectural tasks.
* **Out of scope:** Business model and long‑term roadmap (see PRD for product plans).

---

## 3) System Overview

```
[ Browser (HTML/JS) ]
        │   HTTPS (fetch / JSON)
        ▼
[ Internal Node.js Service(s) ]  ← cache / auth / rate‑limit
        │   RPC/HTTP → AO gateways
        ▼
[ AO Lua Processes ]  ← on‑chain state & handlers
        │
        ▼
[ Arweave Storage / AO Network ]
```

**Key ideas:**

* **UI** never talks directly to AO; it relies on the **Node layer** for stability, caching, and schema shaping.
* **AO Lua processes** are versioned artifacts; their output shapes are treated as contracts by the Node layer.
* **Caching** exists to reduce AO read pressure; TTLs trade precision for responsiveness.

---

## 4) Component Architecture

### 4.1 Frontend (HTML/JS)

* **Type:** Static single‑page UI (vanilla JS).
* **Responsibilities:**

  * Render lists and details of AO processes and/or AO endpoints.
  * Issue reads to the internal Node service (REST; future: WS/SSE for live updates).
  * Present health/status indicators and basic filtering/sorting.
* **Build & Deploy:** *[owner fill‑in]* (e.g., Vite/Webpack → static hosting/CDN).
* **Config:** base API URL via environment at build time.

### 4.2 Node.js Service(s)

* **Role:** Aggregator and read‑model provider for the UI; source of internal JSON.
* **Capabilities:**

  * **HTTP REST** endpoints (internal only).
  * **Response shaping** (Lua → JSON) and **schema normalization**.
  * **Caching**: memory or Redis *[owner fill‑in]*.
  * **Back‑pressure** & **rate limiting** toward AO network.
* **Processes:** Single service or multiple micro‑services *[owner fill‑in]*.
* **Observability:** Structured logs; metrics hooks (see §10).
* **Security:** CORS rules restricted to the UI origin; input validation.

### 4.3 AO Layer (Lua Processes)

* **Role:** On‑chain processes exposing read endpoints; the canonical state.
* **Contracts:** Each process has an **ID**, a **version**, and a **response schema** that the Node layer consumes.
* **Operations:** Deployed and updated via AO toolchain; changes must respect compatibility policy (see §12).

### 4.4 External Dependencies

* **AO/Arweave gateway(s)** *[owner fill‑in]*.
* **Redis/Cache** (if used) *[owner fill‑in]*.
* **Static hosting/CDN** *[owner fill‑in]*.

---

## 5) Interfaces (Internal)

> There is **no public API/SDK** yet. The following endpoints are the **internal contract** between UI and Node. If an endpoint is not yet implemented, it represents a near‑term task.

**REST (internal)**

* `GET /api/processes` → Array of processes
  Example:

  ```json
  [
    { "id": "ao:…", "name": "…", "lastHeight": 12345, "status": "healthy", "updatedAt": "2025-10-26T05:00:00Z" }
  ]
  ```
* `GET /api/processes/{id}` → Process detail

  ```json
  { "id": "ao:…", "name": "…", "version": "v1", "metrics": { "throughput": 12.3 }, "schemaVersion": "1.0.0" }
  ```
* `GET /api/processes/{id}/events?cursor=&limit=` → Events (paged)

  ```json
  { "items": [ { "t": 1698297600, "type": "state_change", "data": {…} } ], "nextCursor": "…" }
  ```

**Future (not yet implemented)**

* **WebSocket/SSE**: `/ws` for real‑time subscriptions to processes/events.

---

## 6) Data Model (Illustrative Contracts)

> Treat these as **proto‑schemas**; firm up once the AO process inventory is documented.

```json
// ProcessSummary
{
  "id": "ao:process-id",
  "name": "Process Name",
  "status": "healthy|degraded|unknown",
  "lastHeight": 123456,
  "owner": "walletOrTeam",
  "tags": ["dex", "oracle"],
  "updatedAt": "2025-10-26T05:00:00Z"
}
```

```json
// ProcessDetail
{
  "id": "ao:process-id",
  "version": "v1",
  "schemaVersion": "1.0.0",
  "metrics": {
    "throughput": 12.3,
    "latencyMsP50": 240,
    "latencyMsP99": 900
  },
  "endpoints": [
    { "name": "state", "path": "/state" },
    { "name": "events", "path": "/events" }
  ]
}
```

```json
// EventItem
{
  "t": 1698297600,
  "type": "state_change",
  "data": { "key": "value" },
  "tx": "arweave-tx-id"
}
```

---

## 7) Sequence Diagrams (Text)

### 7.1 Load Overview

```
UI → Node: GET /api/processes
Node → Cache: lookup (TTL)
Cache → Node: hit? (if miss:)
Node → AO: fetch process summaries
AO → Node: summarized data
Node → UI: JSON (normalized)
```

### 7.2 View Process Detail

```
UI → Node: GET /api/processes/{id}
Node → Cache: lookup schema + metrics
Node → AO: fetch detail if stale
AO → Node: detail payload (Lua → JSON)
Node → UI: JSON detail (with schema version)
```

### 7.3 (Future) Live Events Subscription

```
UI → Node: WS /ws (subscribe {id})
Node → AO: stream / poll bridge
Node → UI: push events (back‑pressure controlled)
```

---

## 8) Deployment Topology

```
[ Client Browsers ]
        │  CDN (static assets)
        ▼
[ Static Hosting ] — (index.html, JS, assets)
        │  HTTPS
        ▼
[ Node Service(s) ] — (container or serverless)
        │  outbound
        ▼
[ AO Gateways ] ↔ [ AO Network / Arweave ]
```

**Environments**

* **dev:** local UI + Node; AO test processes.
* **staging:** pre‑prod Node + UI; mirrors prod feature flags.
* **prod:** public UI; Node behind WAF/edge proxy.

**Build/Release**

* CI/CD *[owner fill‑in]* (e.g., GitHub Actions) builds UI, runs tests, deploys Node artifacts, applies config per env.

---

## 9) Configuration

* **UI:** `VITE_API_BASE` (or equivalent) for internal API base.
* **Node:** `AO_GATEWAY_URL`, `CACHE_TTL_SECONDS`, `RATE_LIMIT_*`, `LOG_LEVEL`, optional `REDIS_URL`.
* **AO:** process IDs per environment; schema versions.
* **Secrets:** stored via *[owner fill‑in]* (e.g., SSM/Vault/Doppler). No secrets in repo.

---

## 10) Observability & Operations

* **Logging:** structured JSON logs in Node; include request IDs and AO call timings.
* **Metrics:** `api.latency`, `ao.latency`, `cache.hit_rate`, `ao.error_rate`, `rate_limit.dropped`.
* **Tracing:** (near‑term) instrument Node for distributed tracing between handlers and AO calls.
* **Dashboards:** service health (RPS, p50/p99, errors), AO latency, cache hit rate.
* **Alerts:** high error rate, low cache hit (<60%), AO gateway errors, latency p99 > 1.5s.

---

## 11) Security Posture

* **Surface:** Internal REST only; restrict CORS to UI origin(s).
* **Input Validation:** sanitize query and path params to prevent injection.
* **Secrets:** env‑injected; rotate per policy.
* **WAF/Edge:** rate limits; block common bots.
* **Future:** API keys/OAuth when public API is introduced; per‑endpoint quotas.

---

## 12) Compatibility & Versioning

* **Schema Contract:** Node ↔ UI JSON shapes versioned via `schemaVersion`.
* **AO Process Versions:** semantic tags (e.g., `v1`, `v1.1`); Node maintains backward parsers for ≥1 minor release.
* **Deprecation:** publish change log; add warning headers; remove after N releases.

---

## 13) Performance & Capacity

* **Targets:** p50 < 300ms, p95 < 800ms for internal REST; cache hit > 70% on hot paths.
* **Caching:** per‑endpoint TTLs; consider surrogate keys for purge on writes (if applicable).
* **Concurrency:** Node handlers non‑blocking; tune AO call concurrency with circuit breaker.
* **Load Shedding:** return `429`/`503` with `Retry‑After` under back‑pressure.

---

## 14) Failure Modes & Recovery

* **AO Gateway Outage:** serve stale cache; degrade UI with banners; exponential backoff.
* **Cache Failure:** fall back to direct AO with reduced QPS; warn ops.
* **Schema Mismatch:** reject with `409` and log; feature flag rollback.
* **Partial Data:** render UI with placeholders; track incomplete states.

---

## 15) Dependencies & Versions (owner fill‑in)

| Area  | Dependency       | Version | Notes            |
| ----- | ---------------- | ------- | ---------------- |
| Node  | node             | x.y.z   | runtime          |
| Node  | express/fastify  | —       | server framework |
| Cache | redis            | —       | optional         |
| AO    | ao-lua toolchain | —       | build/deploy     |
| UI    | build tool       | —       | vite/webpack     |

---

## 16) Risks & Assumptions

* **Risk:** AO data access latency spikes → user experience jitter.
* **Risk:** Missing formal schema registry → brittle transformations.
* **Assumption:** No multi‑writer use cases (read‑mostly).
* **Assumption:** Public API/SDK will be introduced later with proper auth.

---

## 17) Near‑Term Architecture Tasks (Ready to ticket)

1. **Service Inventory & AO Process Catalog** — enumerate services, ports, envs, and AO process IDs; publish as JSON.
2. **Define JSON Schemas** for `/api/processes`, detail, events; add contract tests.
3. **Introduce Cache Layer** (if absent) — memory/Redis with per‑endpoint TTLs.
4. **Observability v1** — logs + metrics; dashboards + alerts as in §10.
5. **Circuit Breakers** & timeouts for AO calls; progressive backoff strategy.
6. **WS/SSE Spike** — design and PoC for real‑time updates (subscription topics, filters).
7. **Security Hardening** — tighten CORS, validation; add WAF rate limits at edge.
8. **Deployment Profiles** — document dev/stage/prod infra and env configs.
9. **Schema Versioning Policy** — adopt semver for AO responses + Node contracts.

---

## 18) Appendices

### 18.1 Service Inventory Template

| Service     | Runtime          | Purpose       | Port/Host | Key Endpoints | Owners |
| ----------- | ---------------- | ------------- | --------- | ------------- | ------ |
| ui-web      | Static (HTML/JS) | UI            | —         | `/`           | team:… |
| api-gateway | Node.js          | Internal REST | :____     | `/api/*`      | team:… |

### 18.2 AO Process Inventory Template

| Env     | Process ID | Version | Endpoints           | Notes |
| ------- | ---------- | ------- | ------------------- | ----- |
| dev     | ao:…       | v1      | `/state`, `/events` |       |
| staging | ao:…       | v1      |                     |       |
| prod    | ao:…       | v1      |                     |       |

### 18.3 Error Codes (Internal)

| Code | Meaning           | Action                |
| ---- | ----------------- | --------------------- |
| 429  | Rate limited      | Retry after header    |
| 502  | Upstream AO error | Backoff + cache serve |
| 503  | Overloaded        | Shed + alert          |
| 409  | Schema conflict   | Report + rollback     |

---

**Maintainers:** Architecture & Platform team
**Last updated:** 26 Oct 2025 (AEST)
