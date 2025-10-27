# The Eye of AO — Product Requirements Document (PRD)

> Based on the live codebase (`flattened-codebase.xml`) and the Project Brief (Brownfield) from Oct 2025.

---

## 1) Overview

**Product:** The Eye of AO
**Type:** Web-based data explorer for AO (Arweave) processes
**Current Status:** Live and functional
**Primary Goal:** Enable developers, analysts, and node operators to visualize, query, and monitor on‑chain AO process data in near real-time.

---

## 2) Current Product Features

### 2.1 Core Features

* **Browser-based UI** built in HTML/JavaScript.

  * Displays AO process data in readable form (tables, charts, logs).
  * Basic page structure: Overview, Processes, Endpoints, Operators, and Settings.
* **Data Aggregation Layer** via Node.js services **(internal only; no public SDK/API yet)**.

  * Acts as a middleware to query Lua processes hosted on AO.
  * Normalizes and shapes on‑chain data into JSON responses consumable by the frontend.
* **AO Integration Layer**

  * Lua-based AO processes serve as endpoints for on‑chain data.
  * Node.js backend handles caching, rate limiting, and reformatting.
* **Documentation & Tooling System**

  * BMAD agent and PRD tooling for structured documentation and development planning.
  * Includes templates for brownfield documentation, PRD, and architectural diagrams.

### 2.2 Supporting Features

* **Configuration Management:** Environment variables (.env) for secrets, AO endpoints, and API keys.
* **Basic Deployment Pipeline:** Static UI build + Node service deployment (supports multi-env).
* **Observability Hooks:** Logging and metrics capabilities via Node.js modules (future integration with Grafana or ELK planned).
* **Developer Tooling:** Node package manager scripts, resource locator utilities, and BMAD bundle management.

---

## 3) User Stories for Existing Functionality

### 3.1 Core User — Analyst/Observer

* **As an analyst**, I want to **view live AO process metrics** so I can monitor the health and state of running processes.
* **As an analyst**, I want to **filter and sort processes** by performance metrics or metadata to focus on specific operations.
* **As an analyst**, I want to **query AO endpoints directly from the UI** so I can validate data integrity.

### 3.2 Core User — Developer/Builder

* **As a builder**, I want to **register and track my AO Lua processes** so I can monitor execution, resource usage, and last updates.
* **As a builder**, I want to **view my process outputs and logs** in the UI for debugging.
* **As a builder**, I want to **expose my process endpoints** publicly (with access control) for others to query.

### 3.3 Core User — Operator/Admin

* **As an operator**, I want to **configure Node API settings and AO endpoints** to manage environments.
* **As an operator**, I want to **monitor the performance of Node.js services** and AO endpoints for bottlenecks.
* **As an operator**, I want to **update or redeploy processes** via automated CI/CD.

---

## 4) Technical Requirements & Constraints

### 4.1 Functional Requirements

* The frontend must render AO process data from backend JSON responses.
* The Node.js service exposes **internal** endpoints used solely by the UI (**no public API/SDK yet**). If not already implemented, these endpoints are immediate implementation targets:

  * `/api/processes` → list all processes.
  * `/api/processes/{id}` → fetch process details.
  * `/api/processes/{id}/events` → fetch historical or real-time events.
* AO Lua processes must maintain data schemas consistent with backend transformations.
* Backend caching must reduce redundant AO network calls.

### 4.2 Non‑Functional Requirements

* **Performance:**

  * Target latency: <500ms per data fetch.
  * Node service uptime >99%.
* **Scalability:** Support horizontal scaling of Node.js APIs.
* **Security:**

  * Implement CORS and input validation.
  * Secrets stored in environment or secure vaults.
* **Reliability:**

  * Graceful degradation if AO network or Node API is unavailable.
  * Caching and retry logic for network failures.
* **Maintainability:**

  * All service endpoints and AO processes documented via BMAD schema.
  * Code modularity between UI, Node API, and AO layers.

### 4.3 Known Constraints

* AO Lua endpoints are dependent on AO network performance and stability.
* Node.js caching may introduce slight data staleness.
* No formal authentication layer currently implemented — needs future work.
* Observability (metrics, traces) not yet fully integrated.

---

## 5) Future Feature Opportunities

### 5.1 Product & User Experience

* **Unified Process Explorer:** Searchable interface for all AO processes, metadata, and ownership.
* **Real-time Data Feeds:** WebSocket or SSE for live process event streaming.
* **Alerting System:** Configurable alerts for process failures or threshold breaches.
* **Workspaces & Saved Views:** Personal dashboards for analysts and builders.

### 5.2 Platform Enhancements

* **Schema Registry:** Auto-generate and store JSON schemas for AO processes.
* **Public API & SDK (future):** Provide a client SDK for developers to consume AO data easily.
* **Historical Data Indexer:** Maintain long-term data snapshots for trend analysis.
* **Edge Caching:** Deploy CDN for static content and cache API responses for heavy traffic.

### 5.3 Engineering Improvements

* **Observability:** Integrate logging, tracing, and metrics dashboards.
* **Testing:** Add contract and integration testing for Node ↔ AO ↔ UI layers.
* **Security:** Introduce API key/OAuth system for authenticated access.
* **Performance Optimization:** Cache tuning and Lua endpoint efficiency improvements.

---

## 6) Success Metrics

| Category                  | Metric                      | Target        |
| ------------------------- | --------------------------- | ------------- |
| **Performance**           | API response latency        | < 500ms       |
| **Availability**          | Node service uptime         | > 99%         |
| **User Engagement**       | Daily active users          | +25% QoQ      |
| **Data Freshness**        | Cache TTL accuracy          | < 10s delay   |
| **Reliability**           | API error rate              | < 1%          |
| **Analyst Productivity**  | Saved views per active user | ≥ 3 per month |
| **Documentation Quality** | Updated PRDs per feature    | 100% coverage |

-----------|---------|--------|
| **Performance** | API response latency | < 500ms |
| **Availability** | Node service uptime | > 99% |
| **User Engagement** | Daily active users | +25% QoQ |
| **Data Freshness** | Cache TTL accuracy | < 10s delay |
| **Reliability** | API error rate | < 1% |
| **Developer Adoption** | SDK / API usage | 10+ teams by Q2 2026 |
| **Documentation Quality** | Updated PRDs per feature | 100% coverage |

---

## 7) Next Steps

1. Finalize missing details from Project Brief: UI routes, AO process inventory, service map.
2. Define MVP feature backlog for Real-time Subscriptions & Unified Process Explorer.
3. Implement Observability layer (logging + metrics + error tracking).
4. Create separate Architecture Document aligned to this PRD for system-level planning.
5. Integrate CI/CD checks for doc completeness and code coverage.

---

**Maintained by:** Product & Engineering team @ The Eye of AO
**Last updated:** October 2025
