# STORY-002 — Remove CUs from Node Displays and UI Components

**Role:** Scrum Master • **Owner:** Frontend / Platform • **Status:** Ready for Development • **Target Release:** M1+1 (next sprint)

---

## 1) Background & Problem

* Historically, each node displayed a **CU (Compute Unit)** identifier next to its address, with additional links or references to CU details.
* The underlying **CU feature has been deprecated** and is no longer part of the node data model or backend responses.
* The UI still renders CU references (labels, links, or badges) in several components — leading to outdated displays and occasional broken links.
* We need to **fully remove all CU mentions and associated UI elements**, simplifying node presentation to only show node addresses and their status.

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

* UI cleanup in all routes that render nodes or node details (tables, cards, dashboards, popovers).
* Remove CU-related links and labels from templates and components.
* Update TypeScript/JS interfaces to drop `cu` fields.
* Adjust any backend or cache schema expecting CU data.
* Validate documentation and screenshots.

### Out of Scope

* Adding new node metadata or visual redesigns.
* Deprecation notices (CUs are already removed server-side).

---

## 5) Affected Components (Frontend)

| Component           | File/Area                               | Action                                  |
| ------------------- | --------------------------------------- | --------------------------------------- |
| `NodeCard`          | `/components/NodeCard.js`               | Remove CU badge and link                |
| `NodeTable`         | `/views/Nodes.vue` or `/views/Nodes.js` | Remove CU column                        |
| `NodeDetail`        | `/components/NodeDetail.js`             | Drop CU info section                    |
| `NodeStatusPopover` | `/components/NodeStatusPopover.js`      | Remove CU tooltip                       |
| `API Contracts`     | `/api/nodes` responses                  | Ensure `cu` field is absent             |
| `Docs & Help`       | `/docs/nodes.md`                        | Update screenshots / remove CU mentions |

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

* [ ] CU fields, labels, and links removed from all visible UI components.
* [ ] `/api/nodes` and `/api/nodes/status` responses do not include `cu` field.
* [ ] FE build passes without TypeScript/prop warnings referencing CU.
* [ ] Visual review confirms no CU text or icons appear.
* [ ] Docs and help pages updated accordingly.

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

1. Merge feature branch behind flag `REMOVE_CU_UI=false` (default).
2. Enable flag in staging and verify node pages.
3. Remove flag and deploy to production.
4. Communicate cleanup in changelog / release notes.

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
