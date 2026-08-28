# STORY-002 — Remove CUs from Node Displays and UI Components

**Role:** Scrum Master • **Owner:** Frontend / Platform • **Status:** Ready for Development • **Target Release:** M1+1 (next sprint)

---

## 1) Background & Problem

* Historically, each node displayed a **CU (Compute Unit)** identifier next to its address, with additional links or references to CU details.
* The underlying **CU feature is deprecated for **HyperBEAM** nodes (but **still valid on Legacynet**); backend responses for HyperBEAM no longer include CU.
* The UI still renders CU references (labels, links, or badges) in several components — leading to outdated displays and occasional broken links.
* We need to **remove all CU mentions and associated UI elements on HyperBEAM pages only** (Nodes List + Globe), simplifying node presentation to show only addresses/status. **Legacynet pages retain CUs** unchanged.

---

## 2) User Story

**As a user**, when I view node details or lists, I should see **only node addresses and statuses**, with **no references to CUs** or deprecated links, so the interface reflects the current data model.

---

## 3) Goals & Success Criteria

| Goal                                   | Success Metric                                                |
| -------------------------------------- | ------------------------------------------------------------- |
| Remove all CU-related fields and links | No CU text or icon in any UI route                            |
| Simplify node display                  | Node list shows only address, status, uptime, and region      |
| Ensure backward compatibility          | No 404s or broken bindings due to removed CU props            |
| Reduce code complexity                 | Remove redundant CU props and conditionals from FE components |

---

## 4) Scope

### In Scope

* UI cleanup **only** on HyperBEAM pages: **Nodes List** and **Globe**.
* Remove CU-related links/labels/badges on those pages.
* Update shared components to **gate CU display by network** (show only when `network === 'legacynet'`).
* Ensure backend payloads for HyperBEAM contain **no `cu` field** and FE ignores if present.

### Out of Scope

* **Legacynet pages** — keep CU displays and links intact.
* Adding new node metadata or visual redesigns.
* Deprecation notices (CUs already removed server-side for HyperBEAM).

---

## 5) Affected Components (Frontend)

| Component                       | File/Area                  | Action                                                |
| ------------------------------- | -------------------------- | ----------------------------------------------------- |
| **HyperBEAM Nodes List**        | `/views/nodes-hyperbeam.*` | Remove CU column/badges/links                         |
| **HyperBEAM Globe**             | `/views/globe.*`           | Remove CU overlays, legends, tooltips                 |
| **Shared NodeCard (if reused)** | `/components/NodeCard.*`   | Condition CU render on `network==='legacynet'`        |
| **Legacynet Nodes List/Detail** | `/views/*legacynet*`       | **No change**; keep CU displays                       |
| **API Contracts**               | `/api/nodes` responses     | Ensure HyperBEAM excludes `cu`; Legacynet may include |
| **Docs & Help**                 | `/docs/nodes.md`           | Clarify CU shown only on Legacynet                    |

------------|-----------|--------|
| `NodeCard` | `/components/NodeCard.js` | Remove CU badge and link |
| `NodeTable` | `/views/Nodes.vue` or `/views/Nodes.js` | Remove CU column |
| `NodeDetail` | `/components/NodeDetail.js` | Drop CU info section |
| `NodeStatusPopover` | `/components/NodeStatusPopover.js` | Remove CU tooltip |
| `API Contracts` | `/api/nodes` responses | Ensure `cu` field is absent |
| `Docs & Help` | `/docs/nodes.md` | Update screenshots / remove CU mentions |

---

## 6) Data Model Adjustments

### Before

```json
{
  "id": "node-1",
  "address": "https://node.example",
  "cu": "CU-1234",
  "status": "online"
}
```

### After

```json
{
  "id": "node-1",
  "address": "https://node.example",
  "status": "online"
}
```

---

## 7) Acceptance Criteria

* [ ] **HyperBEAM**: No CU fields, labels, icons, or links on **Nodes List** and **Globe** pages.
* [ ] **Legacynet**: CU displays remain unchanged and functional.
* [ ] Shared components gate CU rendering by network value.
* [ ] `/api/nodes` and `/api/nodes/status` for HyperBEAM do **not** include `cu`; Legacynet responses may include.
* [ ] FE build passes with no references to CU on HyperBEAM routes.
* [ ] Docs updated to reflect network‑specific CU behavior.

---

## 8) Non-Functional Requirements

* **UI Consistency:** Ensure grid alignment and spacing remain consistent after column removal.
* **Backward Safety:** Any cached or legacy data containing `cu` ignored safely.
* **Performance:** Neutral; no regression expected.

---

## 9) Tasks & Estimates (T‑shirt)

**Frontend**

* [ ] Remove CU references in components (S)
* [ ] Update interfaces and props (S)
* [ ] Adjust styling and alignment (XS)
* [ ] Run visual regression test (S)

**Backend**

* [ ] Confirm no `cu` field returned in `/api/nodes` payload (XS)

**Docs/QA**

* [ ] Update screenshots & remove CU references (XS)
* [ ] QA pass across all node views (S)

---

## 10) Test Plan

* **Unit:** Verify node list and detail components render correctly without CU props.
* **Integration:** `/api/nodes` and `/api/nodes/status` return payloads without `cu`.
* **E2E:** Manual visual check in dev/stage; confirm no CU mentions.
* **Regression:** Verify node sorting and filtering unaffected.

---

## 11) Rollout Plan

1. Implement behind flag `REMOVE_CU_UI_HB=false` (affects only HyperBEAM routes).
2. Enable in **staging** on HyperBEAM pages; verify Legacynet pages unaffected.
3. Enable in **prod**; monitor for stray CU references on HyperBEAM.
4. Remove legacy CU code paths for HyperBEAM after stable period.

---

## 12) Risks & Mitigations

| Risk                                  | Mitigation                                                 |
| ------------------------------------- | ---------------------------------------------------------- |
| Cached CU data causing display errors | Null-safe access and migration script to clean local cache |
| Inconsistent UI spacing after removal | CSS review and regression test                             |
| Missed CU references in hidden views  | Full-text search + QA sweep                                |

---

**Definition of Done**

* All acceptance criteria met, CU references removed, QA sign-off complete, merged with feature flag removed.
