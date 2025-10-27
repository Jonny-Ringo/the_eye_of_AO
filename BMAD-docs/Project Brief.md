# The Eye of AO — Project Brief (Brownfield)

> Status: Live & functional • Source analyzed from `flattened-codebase.xml` + team bundle • Date: 26 Oct 2025 (AEST)

---

## 1) One‑liner & Purpose

**Project name:** The Eye of AO

**One‑liner:** *[Owner fill‑in]* → Provide a crisp description in 1–2 sentences (what it is, who it’s for, why it matters). Example pattern: “A web app that **observes and surfaces on‑chain AO data** in near‑real time for **builders and analysts**, with a **browser UI**, **Node.js data services**, and **Lua‑based AO processes** that act as on‑chain data endpoints.”

**Primary users:** *[Owner fill‑in]* (e.g., AO protocol developers, dapp teams, analysts, power users)

**Primary jobs-to-be-done:**

* *[Owner fill‑in]* Observe/visualize AO (Arweave) process data
* *[Owner fill‑in]* Query / subscribe to AO process events
* *[Owner fill‑in]* Export or integrate AO data into downstream tools

---

## 2) Current Features & Functionality (Observed + From Code Bundle)

### 2.1 User‑facing

* **Web UI (HTML/JS)** for viewing AO‑sourced data. *[Confirm: dashboards, tables, timelines, alerts?]*
* **Data refresh model:** *[Owner fill‑in]* (polling / push / websockets)
* **Basic navigation & pages:** *[List the visible pages in prod]* (e.g., Overview, Processes, Endpoints, Operators, Settings)

### 2.2 System‑facing & Ops

* **Node.js services** acting as middle‑tier APIs / aggregators for AO data.
* **Lua processes running on AO** that expose data as on‑chain endpoints consumed by backend/frontend.
* **Agent & documentation tooling present in repo** (BMAD Method bundle) to generate brownfield docs, PRDs, and architecture artifacts; includes installer, resource locator, and advanced elicitation utilities for structured docs and workflows.

### 2.3 Developer Tooling present in codebase

* **BMAD Method web bundle** for analysis/PRD/architecture generation & checklists.
* **Advanced elicitation** workflows to iteratively refine docs and decisions.
* **Node package tooling** (installer & utilities) for managing bundles and resources.

> Note: The uploaded bundle contains extensive documentation tooling and agent frameworks. It does **not** include an obvious app README or a single app entrypoint; the live UI and server code are present as a flattened set of resources. The brief below reflects what exists plus owner‑fill‑ins where discovery cannot be inferred purely from the bundle.

---

## 3) User Workflows

### 3.1 Core Reader/Analyst Workflow

1. User loads **Overview** page → sees summary of AO processes/metrics [owner: detail KPIs]
2. User filters or selects an AO **process / endpoint**
3. App queries **Node API** → which queries **AO Lua endpoints**
4. Results render in UI (table, chart, or logs) with pagination/stream updates
5. Optional: export/subscribe/alert setup [owner: confirm]

### 3.2 Builder Workflow (if applicable)

1. Builder registers a **new AO Lua process** (contract/job)
2. Node service detects/ingests address + schema
3. UI lists new process → health, last block/tx, throughput
4. Builder configures **webhook** / **SDK** access keys (if any) → consume data downstream

### 3.3 Ops & Maintenance

* Environment config via `.env`/secrets for API keys, AO endpoints, cache, and rate limits.
* Deployment pipeline builds static UI, deploys Node servers, and ensures AO Lua processes are published & pinned.
* Observability: logs/metrics/dashboards [owner: fill‑in tools such as Grafana/ELK/Cloud logs]

---

## 4) Tech Architecture Overview

### 4.1 High‑level

```
[Browser UI (HTML/JS)]
        │  fetch/json/ws
        ▼
[Node.js API Layer / Aggregators]
        │  RPC/HTTP → auth, caching, shaping
        ▼
[AO (Arweave) Lua Processes]
        │  on‑chain state + endpoints
        ▼
[Arweave network / Storage]
```

### 4.2 Components

* **Frontend:** static HTML/JS app; build tooling *[owner: Vite/Webpack?]*; uses fetch/websocket to Node APIs.
* **Backend (Node):** one or more servers providing:

  * **Read endpoints** that aggregate AO process state, normalize to UI schemas
  * **Caching** layer (memory/Redis/*[owner fill‑in]*) to reduce chain calls
  * **Auth/rate‑limit** if public
  * **Transformers** converting Lua/AO responses → UI JSON
* **On‑chain (AO/Lua):**

  * **Processes** exposing data endpoints and job logic
  * **Schema/versioning** strategy for process response formats
  * **Security model** (caps, whitelists, verification)
* **Docs/Agent Tooling:** BMAD bundle for structured docs, PRDs, architecture, and checklists to keep living documentation in sync as features evolve.

### 4.3 Data Flow & Performance

* **Ingress:** Frontend triggers **Node** → Node queries **AO Lua** → returns shaped JSON.
* **Caching strategy:** define TTL by endpoint; cache bust on writes (if any).
* **Back‑pressure & rate limits:** protect AO and Node services under load.
* **Consistency:** AO as source of truth; Node provides read models.

### 4.4 Environments & Deploy

* **Envs:** dev / staging / prod with isolated AO processes per env.
* **CI/CD:** *[owner fill‑in]* (e.g., GitHub Actions) → build, test, deploy Node + static assets.
* **Infra:** *[owner fill‑in]* (e.g., Docker + ECS/K8s; static hosting + serverless for APIs).
* **Secrets:** managed via *[owner fill‑in]* (e.g., SSM, Vault, Doppler).

---

## 5) Current Surface Area (from uploaded bundle)

* **Agent/Docs system:** rich set of roles (Analyst, PM, Architect, PO, etc.), templates for **brownfield PRDs**, **architecture docs**, **checklists**, and **advanced elicitation**.
* **Node‑based tooling:** package metadata and utilities for resource discovery and YAML extraction that support the documentation workflows.
* **Guidance checklists:** cover story quality, architecture validation, and release readiness.

*Implication*: the repo is prepared for **living documentation** and **structured planning**, even if feature code is split across services.

---

## 6) Known Gaps / Assumptions to Confirm

1. **Product description & target users** — fill the one‑liner and personas.
2. **UI pages & exact features** — enumerate all routes/screens and their states.
3. **Node service map** — list each service, port, key endpoints, and dependencies.
4. **AO process inventory** — list process IDs, what they return, and versioning.
5. **Observability** — logging, metrics, tracing; SLOs and error budgets.
6. **Security** — authN/Z for APIs, CORS policy, input validation, abuse prevention.
7. **Data contracts** — JSON schemas for request/response; change‑management policy.
8. **Performance envelope** — expected QPS, latency SLO, cache hit rate, limits.
9. **Disaster recovery** — rollback plan; AO process migration strategy.

---

## 7) Goals for Future Development

### 7.1 Product

* **Unified Process Explorer** — searchable catalog of AO processes with metadata, versions, owners, schemas.
* **Real‑time Subscriptions** — websockets/server‑sent events for live AO updates; client replay.
* **Alerting & Webhooks** — user‑defined triggers on AO events → email/webhook integrations.
* **Workspace & Saved Views** — shareable dashboards, parameterized queries, and embeds.
* **Public API / SDK** — publish a typed SDK for consuming the Node APIs and AO endpoints.

### 7.2 Platform & Data

* **Schema Registry** for AO processes, plus auto‑generated TypeScript types.
* **Historical Backfill & Snapshots** (indexer or periodic dumps) for time‑series charts.
* **Edge Caching** for hot endpoints; CDN in front of static UI + API gateway.

### 7.3 Engineering Quality

* **Contract Testing** (Pact/AVA/Jest) between UI ↔ Node ↔ AO.
* **Unified Error Surface** with correlation IDs; structured logs.
* **Load Testing** with target SLOs; staged rollouts with canaries.
* **Docs as Code** using the included BMAD templates; PR gates for doc updates.

### 7.4 Security & Compliance

* **API Keys / OAuth** for write or privileged reads.
* **Rate‑limiting & WAF** at edge.
* **Input validation** across Node and Lua boundaries.
* **Secrets management** & rotation policy.

---

## 8) Appendices

### 8.1 Service Inventory (owner fill‑in)

| Service     | Runtime          | Purpose                        | Port/Host | Key Endpoints |
| ----------- | ---------------- | ------------------------------ | --------- | ------------- |
| ui-web      | Static (HTML/JS) | User interface                 | —         | `/` (routes…) |
| api‑gateway | Node.js          | Public REST/WebSocket API      | :____     | `/api/*`      |
| ao‑proc‑X   | Lua on AO        | On‑chain data/process endpoint | on‑chain  | `ao:<id>`     |

### 8.2 Data Contracts (owner fill‑in)

* **GET** `/api/processes` → list of processes { id, name, lastHeight, … }
* **GET** `/api/processes/{id}` → detail & latest state
* **GET** `/api/processes/{id}/events` → paginated events
* **WS** `/ws` → subscriptions { topic, filter }

### 8.3 Environments (owner fill‑in)

| Env     | Base URL | Node APIs | AO Process IDs | Notes |
| ------- | -------- | --------- | -------------- | ----- |
| dev     |          |           |                |       |
| staging |          |           |                |       |
| prod    |          |           |                |       |

---

## 9) How to Keep This Brief “Living”

* Treat this as the **single source of truth**; link code, dashboards, and runbooks.
* Update the **service inventory**, **AO process list**, and **data contracts** with every change.
* Use the bundled BMAD **brownfield PRD** and **architecture** templates to document any new feature or refactor before implementation.
* Gate PRs on docs updated + basic checklists (story readiness, architecture readiness, release readiness).

---

### Ready‑to‑Run Next Steps (suggested)

1. Fill the **One‑liner, Target users, and UI pages** in this brief.
2. Add a **Service Inventory** and **AO Process Inventory** with real IDs/URLs.
3. Pick a next feature from §7 and draft a **Brownfield PRD** using your included template.
4. Draft a **Brownfield Architecture** doc for the chosen feature (Node + AO + UI changes).
5. Define SLOs and ship with basic **observability** + **load tests**.
