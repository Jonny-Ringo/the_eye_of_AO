import {
  fitHostnameToElement,
  getCachedHyperbeamRoster,
  updateCachedHyperbeamProbe,
  warmHyperbeamNodeCache
} from "./node-discovery.js";

(function() {
  const t = document.createElement("link").relList;
  if (t && t.supports && t.supports("modulepreload")) return;
  for (const s of document.querySelectorAll('link[rel="modulepreload"]')) o(s);
  new MutationObserver((s) => {
    for (const r of s) if (r.type === "childList") for (const l of r.addedNodes) l.tagName === "LINK" && l.rel === "modulepreload" && o(l);
  }).observe(document, { childList: true, subtree: true });
  function n(s) {
    const r = {};
    return s.integrity && (r.integrity = s.integrity), s.referrerPolicy && (r.referrerPolicy = s.referrerPolicy), s.crossOrigin === "use-credentials" ? r.credentials = "include" : s.crossOrigin === "anonymous" ? r.credentials = "omit" : r.credentials = "same-origin", r;
  }
  function o(s) {
    if (s.ep) return;
    s.ep = true;
    const r = n(s);
    fetch(s.href, r);
  }
})();
const Be = "https://arweave.net/graphql", _e = "hyperbeam-field-view:v1", Me = 1, Ee = [3e4, 6e4, 12e4], D = 12e4, He = 600 * 1e3, Ue = 3600 * 1e3, Ce = 9e3, je = 20, Ge = 512 * 1024, Ke = 2 * 1024 * 1024, de = [{ key: "requests", label: "HTTP requests", unit: "ops", kind: "counter" }, { key: "errors", label: "Server errors", unit: "ops", kind: "counter" }, { key: "events", label: "Events", unit: "events", kind: "counter" }, { key: "memory", label: "VM memory", unit: "bytes", kind: "gauge" }, { key: "processes", label: "BEAM processes", unit: "count", kind: "gauge" }, { key: "ports", label: "BEAM ports", unit: "count", kind: "gauge" }, { key: "runQueue", label: "Run queue", unit: "count", kind: "gauge" }, { key: "systemLoad", label: "System load", unit: "load", kind: "gauge" }, { key: "reductions", label: "Reductions", unit: "ops", kind: "counter" }, { key: "networkIn", label: "Network received", unit: "bytes", kind: "counter" }, { key: "networkOut", label: "Network sent", unit: "bytes", kind: "counter" }, { key: "outbound", label: "Outbound connections", unit: "count", kind: "gauge" }, { key: "uptime", label: "Node uptime", unit: "seconds", kind: "gauge" }, { key: "garbageCollections", label: "Garbage collections", unit: "ops", kind: "counter" }, { key: "latencyP95", label: "HTTP lifetime p95", unit: "seconds", kind: "gauge" }, { key: "cacheHitRatio", label: "Cache hit ratio", unit: "percent", kind: "gauge" }], te = [{ key: "agent", label: "Agent", pattern: /agent|tool_call|final_answer|ouroboros/ }, { key: "compute", label: "Compute", pattern: /compute|ao_result|subresolution|worker|wasm|lua|process/ }, { key: "schedule", label: "Scheduling", pattern: /schedul|assignment|cron|push/ }, { key: "bundler", label: "Bundling", pattern: /bundl|proof|dispatch/ }, { key: "indexer", label: "Indexing", pattern: /copycat|index|arweave_(?:block|transaction|bundle|item)|chunk/ }, { key: "storage", label: "Storage", pattern: /store|cache|caching|lmdb/ }, { key: "gateway", label: "Gateway", pattern: /gateway|graphql|arweave_offset|ans104/ }, { key: "http", label: "HTTP", pattern: /http|connection_pool|rate_limit|cowboy/ }, { key: "security", label: "Verification", pattern: /verify|httpsig|commit|signature|auth|secret|green_zone|tpm/ }, { key: "system", label: "Runtime", pattern: /system_monitor|process_sampler|prometheus|boot/ }, { key: "health", label: "Health", pattern: /long_schedule|long_gc|large_heap|busy_port|error|warning/ }], pe = [{ family: "scheduler-location", protocolTag: "Data-Protocol", typeTag: "Type", values: ["Scheduler-Location", "Location"], sort: "HEIGHT_DESC" }, { family: "location", protocolTag: "data-protocol", typeTag: "type", values: ["location"], sort: "HEIGHT_DESC" }, { family: "superseded", protocolTag: "data-protocol", typeTag: "type", values: ["superseded"], sort: "HEIGHT_ASC" }], xe = /* @__PURE__ */ new Set(["commitments", "ao-types", "signature", "signature-input", "content-digest", "hashpath", "status"]);
function H() {
  return { version: Me, peers: {}, settings: { pollMs: D, pollDefaultVersion: 2, autoRefresh: true, showUnreachable: false }, discovery: { lastRun: null, records: 0, error: null, heads: {}, complete: {}, cursors: {}, truncated: false } };
}
function B(e) {
  const t = Number(e);
  return Number.isFinite(t) ? Ee.reduce((n, o) => Math.abs(o - t) < Math.abs(n - t) ? o : n, Ee[0]) : D;
}
function We(e) {
  if (!e || e.version !== Me || typeof e.peers != "object") return H();
  const t = { ...H(), ...e }, defaultVersion = Number(e.settings?.pollDefaultVersion) || 0;
  return t.settings = { ...H().settings, ...e.settings || {} }, defaultVersion < 2 && (t.settings.pollMs = D, t.settings.pollDefaultVersion = 2), t.settings.pollMs = B(t.settings.pollMs), t.discovery = { ...H().discovery, ...e.discovery || {} }, Object.values(t.peers).forEach((n) => {
    n.records = Array.isArray(n.records) ? n.records.map((s) => ({ ...s, stale: s.expiresAt ? s.expiresAt < Date.now() : null })) : [], n.samples = Array.isArray(n.samples) ? n.samples.slice(-1e3) : [];
    let o = 0;
    n.samples.forEach((s) => {
      const r = Number(s.seq);
      o = Number.isInteger(r) && r > o ? r : o + 1, s.seq = o, s.pollMs = B(s.pollMs ?? t.settings.pollMs), s.events = Array.isArray(s.events) ? s.events.filter((l) => Array.isArray(l) && Number.isInteger(l[0]) && Number.isFinite(l[1])).sort(([l], [a]) => l - a) : null;
    }), n.sampleSequence = Math.max(Number(n.sampleSequence) || 0, o), n.eventKeys = Array.isArray(n.eventKeys) ? n.eventKeys.filter((s) => Array.isArray(s) && s.length === 2 && s.every((r) => typeof r == "string")) : [], n.status === "checking" && (n.status = n.lastSeen && n.lastChecked === n.lastSeen ? "online" : n.lastChecked ? "offline" : "unknown"), n.consecutiveFailures = Math.max(n.status === "offline" ? 1 : 0, Number(n.consecutiveFailures) || 0), n.manual = !!n.manual;
  }), t;
}
function Je(e = window.localStorage) {
  try {
    return We(JSON.parse(e.getItem(_e)));
  } catch {
    return H();
  }
}
function Ve(e) {
  return e?.name === "QuotaExceededError" || e?.name === "NS_ERROR_DOM_QUOTA_REACHED" || e?.code === 22 || e?.code === 1014;
}
function ze(e, t = window.localStorage) {
  for (; ; ) try {
    return t.setItem(_e, JSON.stringify(e)), true;
  } catch (n) {
    if (!Ve(n)) return false;
    let o = false;
    if (Object.values(e.peers).forEach((s) => {
      if (s.samples?.length > 80) {
        const r = s.samples.slice(-80), l = s.samples.slice(0, -80);
        let a = l.filter((c, u) => u % 2 === 0);
        a.length === l.length && (a = []), s.samples = a.concat(r), o = true;
      }
    }), !o) return false;
  }
}
function fe(e) {
  const t = String(e || "").trim();
  if (!t) throw new Error("Enter a node URL.");
  const n = /^[a-z][a-z\d+.-]*:/i.test(t) ? t : `https://${t}`;
  let o;
  try {
    o = new URL(n);
  } catch {
    throw new Error("That is not a valid URL.");
  }
  if (!/^https?:$/.test(o.protocol)) throw new Error("Node URLs must use HTTP or HTTPS.");
  if (o.username || o.password) throw new Error("Node URLs cannot contain credentials.");
  if (o.search || o.hash) throw new Error("Node URLs cannot contain a query string or fragment.");
  if (o.port === "0") throw new Error("Node URLs cannot use port 0.");
  const s = o.pathname.replace(/\/+$/, "") || "/";
  if (s !== "/" && !/^\/~(?:hyperbuddy|meta|location)@[^/]+(?:\/.*)?$/i.test(s)) throw new Error("Enter the node origin, without an application path.");
  return o.origin;
}
function Qe(e) {
  const t = e.toLowerCase().replace(/^\[|\]$/g, "");
  if (t === "localhost" || t.endsWith(".localhost") || t.endsWith(".local") || /^(0|10|127|169\.254)\./.test(t) || /^192\.168\./.test(t)) return true;
  const n = /^172\.(\d+)\./.exec(t);
  if (n && Number(n[1]) >= 16 && Number(n[1]) <= 31) return true;
  const o = /^100\.(\d+)\./.exec(t);
  return !!(o && Number(o[1]) >= 64 && Number(o[1]) <= 127 || t === "::1" || /^f[cd][0-9a-f]{2}:/i.test(t) || /^fe[89ab][0-9a-f]:/i.test(t));
}
function me(e) {
  try {
    const t = new URL(e);
    return t.protocol !== "https:" ? { ok: false, reason: "HTTPS pages cannot poll an HTTP-only node." } : Qe(t.hostname) ? { ok: false, reason: "Private and loopback addresses are not polled." } : /hyperbeam-test-ignore|\.invalid$|\.example$|\.test$/i.test(t.hostname) ? { ok: false, reason: "Known test location record." } : !t.hostname.includes(".") || /(?:^|\.)(?:ngrok(?:-free)?\.(?:app|io)|loca\.lt|trycloudflare\.com)$/i.test(t.hostname) ? { ok: false, reason: "Ephemeral or non-public location record." } : { ok: true, reason: null };
  } catch {
    return { ok: false, reason: "Invalid URL." };
  }
}
function R(e, t) {
  return (e || []).filter((n) => n?.name === t).map((n) => n.value);
}
function Le(e, t) {
  const n = Number(e);
  return !Number.isFinite(n) || n <= 0 ? null : t === "scheduler-location" && n <= 86400 ? n * 1e3 : n;
}
function Ye(e, t) {
  const n = e?.node || {}, o = pe.find((b) => b.family === t);
  if (!o || t === "superseded") return null;
  const s = (n.tags || []).filter((b) => String(b?.name).toLowerCase() === "type"), r = R(n.tags, o.protocolTag), l = t === "location" ? "url" : "Url", a = t === "location" ? "time-to-live" : "Time-To-Live", c = R(n.tags, l), u = R(n.tags, a);
  if (r.length !== 1 || r[0] !== "ao" || s.length !== 1 || s[0].name !== o.typeTag || !o.values.includes(s[0].value) || c.length !== 1 || u.length !== 1) return null;
  let m;
  try {
    m = fe(c[0]);
  } catch {
    return null;
  }
  const v = R(n.tags, "nonce"), y = Number(v[0]);
  if (t === "location" && (v.length !== 1 || !Number.isSafeInteger(y) || y <= 0)) return null;
  const f = Number(n.block?.timestamp) * 1e3 || null, h = t === "location" && y > 1e12 ? y : f, w = Le(u[0], t);
  if (!w) return null;
  const d = t === "location" ? h + w : null;
  return { url: m, family: t, owner: n.owner?.address || null, transaction: n.id || null, nonce: t === "location" ? y : null, ttl: w, observedAt: h, expiresAt: d, stale: t === "location" ? d < Date.now() : null, blockHeight: n.block?.height || null, source: "arweave" };
}
function V(e, t) {
  const n = t.toLowerCase();
  return Object.entries(e || {}).find(([s]) => s.toLowerCase() === n)?.[1];
}
function Xe(e, t) {
  const n = V(e, "url");
  if (!n) return null;
  let o;
  try {
    o = fe(n);
  } catch {
    return null;
  }
  const s = Number(V(e, "nonce")), r = String(V(e, "type") || "location").toLowerCase();
  if (!pe.some((m) => m.family === r && r !== "superseded")) return null;
  const l = Le(V(e, "time-to-live"), r);
  if (!l) return null;
  const a = Number.isFinite(s) && s > 1e12 ? s : Date.now(), c = e?.commitments || {}, u = Object.values(c).find((m) => m?.committer)?.committer || null;
  return { url: o, family: r, owner: u, transaction: null, nonce: Number.isFinite(s) ? s : null, ttl: l, observedAt: a, expiresAt: r === "location" ? a + l : null, stale: r === "location" ? a + l < Date.now() : null, blockHeight: null, source: `peer:${t}` };
}
function Ze(e) {
  const t = e.values.map((n) => JSON.stringify(n)).join(", ");
  return `
    query Locations($after: String) {
      transactions(
        tags: [
          { name: ${JSON.stringify(e.protocolTag)}, values: ["ao"] }
          { name: ${JSON.stringify(e.typeTag)}, values: [${t}] }
        ]
        first: 100
        after: $after
        sort: ${e.sort}
      ) {
        pageInfo { hasNextPage }
        edges {
          cursor
          node {
            id
            owner { address }
            block { height timestamp }
            tags { name value }
          }
        }
      }
    }
  `;
}
async function et(e, t, n = null) {
  const o = await q(e, Be, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: Ze(t), variables: { after: n } }) }, Ce);
  if (!o.ok) throw new Error(`Arweave GraphQL returned ${o.status}.`);
  const s = await U(o, 1024 * 1024);
  if (s.errors?.length) throw new Error(s.errors[0].message);
  return s.data?.transactions || { edges: [], pageInfo: { hasNextPage: false } };
}
function tt(e) {
  const t = e?.node || {}, n = R(t.tags, "data-protocol"), o = R(t.tags, "type"), s = R(t.tags, "superseded-by");
  return n.length !== 1 || n[0] !== "ao" || o.length !== 1 || o[0] !== "superseded" || s.length !== 1 || !t.owner?.address ? null : { owner: t.owner.address, supersededBy: s[0], transaction: t.id || null, nonce: Number(R(t.tags, "nonce")[0]) || null, blockHeight: t.block?.height || null, observedAt: Number(t.block?.timestamp) * 1e3 || null };
}
function nt(e, t) {
  return e.family === "location" ? (e.nonce || 0) - (t.nonce || 0) || (e.blockHeight || 0) - (t.blockHeight || 0) || (e.observedAt || 0) - (t.observedAt || 0) || String(e.transaction || "").localeCompare(String(t.transaction || "")) : (e.blockHeight || 0) - (t.blockHeight || 0) || (e.observedAt || 0) - (t.observedAt || 0) || String(e.transaction || "").localeCompare(String(t.transaction || ""));
}
function Se(e) {
  const t = /* @__PURE__ */ new Map();
  return e.forEach((n) => {
    const o = `${n.family}:${n.owner || n.transaction}`, s = t.get(o);
    (!s || nt(n, s) > 0) && t.set(o, n);
  }), [...t.values()];
}
function ot(e, t) {
  const n = /* @__PURE__ */ new Map();
  [...t].sort((s, r) => (s.blockHeight || 0) - (r.blockHeight || 0)).forEach((s) => {
    n.has(s.owner) || n.set(s.owner, s.supersededBy);
  });
  const o = (s) => {
    let r = s;
    const l = /* @__PURE__ */ new Set();
    for (let a = 0; r && a < 10 && !(l.has(r) || !n.has(r)); a += 1) l.add(r), r = n.get(r);
    return r;
  };
  return e.map((s) => {
    const r = o(s.owner);
    return { ...s, advertisedBy: r !== s.owner ? s.owner : null, owner: r, resolvedOwner: r };
  });
}
async function st(e = window.fetch.bind(window), t = () => {
}, n = {}) {
  const o = [], s = [], r = { ...n.heads || {} }, l = { ...n.complete || {} }, a = { ...n.cursors || {} };
  let c = 0;
  for (const u of pe) {
    let m = u.family === "superseded" ? null : a[u.family] || null, v = 0, y = false, f = false;
    const h = [], w = l[u.family] ? r[u.family] : null;
    for (; v < je; ) {
      const d = await et(e, u, m);
      v += 1, v === 1 && m === null && d.edges[0]?.node?.id && (r[u.family] = d.edges[0].node.id);
      let b = d.edges;
      if (w && u.family !== "superseded") {
        const _ = b.findIndex((S) => S.node?.id === w);
        _ >= 0 && (b = b.slice(0, _), y = true);
      }
      const $ = [];
      if (b.forEach((_) => {
        if (u.family === "superseded") {
          const S = tt(_);
          S && s.push(S);
        } else {
          const S = Ye(_, u.family);
          S && (h.push(S), $.push(S));
        }
      }), u.family !== "superseded" && (c += $.length), t({ family: u.family, page: v, records: c, pageRecords: Se($) }), y || !d.pageInfo?.hasNextPage || d.edges.length === 0) {
        f = true;
        break;
      }
      m = d.edges[d.edges.length - 1].cursor;
    }
    if (l[u.family] = f, a[u.family] = f || u.family === "superseded" ? null : m, u.family !== "superseded") {
      const d = Se(h);
      o.push(...d), t({ family: u.family, page: v, records: c, completedRecords: d });
    }
  }
  return { records: ot(o, s), rawRecords: c, totalRecords: (Number(n.records) || 0) + c, heads: r, complete: l, cursors: a, truncated: Object.entries(l).some(([u, m]) => u !== "superseded" && !m) };
}
function Te(e, t, n = {}) {
  const o = Date.now(), s = e.peers[t] || { url: t, label: null, manual: false, records: [], samples: [], status: "unknown", firstSeen: o, lastSeen: null, lastChecked: null, lastError: null, info: null, topEvents: [], eventKeys: [], eventTopics: [], metricFamilies: [], sampleSequence: 0, consecutiveFailures: 0 };
  return e.peers[t] = { ...s, ...n, url: t }, e.peers[t];
}
function $e(e) {
  return e.transaction ? `${e.source}|${e.transaction}|${e.url}` : `${e.source}|${e.owner || ""}|${e.nonce || ""}|${e.url}`;
}
function ue(e, t) {
  let n = 0;
  return t.forEach((o) => {
    const s = Te(e, o.url), r = $e(o), l = s.records.findIndex((c) => $e(c) === r);
    l < 0 ? (s.records.unshift(o), s.records = s.records.sort((c, u) => (u.observedAt || 0) - (c.observedAt || 0)).slice(0, 8), n += 1) : s.records[l] = { ...s.records[l], ...o };
    const a = me(s.url);
    s.probeable = a.ok, s.blockedReason = a.reason, a.ok || (s.status = "blocked");
  }), n;
}
function rt(e, t, n = null) {
  const o = fe(t), s = me(o);
  return Te(e, o, { manual: true, label: String(n || "").trim() || null, probeable: s.ok, blockedReason: s.reason, status: s.ok ? e.peers[o]?.status || "unknown" : "blocked" });
}
function at(e, t = D) {
  const n = Math.max(1, Number(e.consecutiveFailures) || 1), o = Math.max(He, B(t) * 4);
  return Math.min(Ue, o * 2 ** Math.min(n - 1, 8));
}
function lt(e, { force: t = false, now: n = Date.now(), pollMs: o = D } = {}) {
  if (e.probeable === false || e.status === "blocked") return false;
  if (t || !e.lastChecked || e.status === "unknown") return true;
  const s = n - e.lastChecked;
  return e.status === "offline" ? s >= at(e, o) : s >= B(o);
}
function it(e, t = false) {
  return !!(t || e.status === "online" || e.status === "unknown" || e.checking);
}
function C(e) {
  return String(e || "").replaceAll("_", "-");
}
async function q(e, t, n = {}, o = Ce) {
  return e(t, { ...n, credentials: "omit", referrerPolicy: "no-referrer", mode: "cors", cache: "no-store", signal: AbortSignal.timeout(o) });
}
async function Re(e, t) {
  const n = Number(e.headers.get("content-length"));
  if (Number.isFinite(n) && n > t) throw new Error(`response exceeds ${t} bytes`);
  if (!e.body?.getReader) {
    const a = await e.text();
    if (new TextEncoder().encode(a).byteLength > t) throw new Error(`response exceeds ${t} bytes`);
    return a;
  }
  const o = e.body.getReader(), s = new TextDecoder();
  let r = 0, l = "";
  for (; ; ) {
    const { done: a, value: c } = await o.read();
    if (a) break;
    if (r += c.byteLength, r > t) throw await o.cancel(), new Error(`response exceeds ${t} bytes`);
    l += s.decode(c, { stream: true });
  }
  return l + s.decode();
}
async function U(e, t = Ge) {
  const n = JSON.parse(await Re(e, t));
  if (!n || typeof n != "object" || Array.isArray(n)) throw new Error("response is not a JSON message");
  return n;
}
function ct(e) {
  const t = [];
  let n = "", o = false, s = false;
  for (const r of e) s ? (n += r, s = false) : r === "\\" ? (n += r, s = true) : r === '"' ? (n += r, o = !o) : r === "," && !o ? (t.push(n), n = "") : n += r;
  return n && t.push(n), t;
}
function ut(e) {
  const t = {};
  return ct(e).forEach((n) => {
    const o = n.indexOf("=");
    if (o < 1) return;
    const s = n.slice(0, o).trim();
    let r = n.slice(o + 1).trim();
    r.startsWith('"') && r.endsWith('"') && (r = r.slice(1, -1)), t[s] = r.replace(/\\n/g, `
`).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }), t;
}
function dt(e) {
  const t = {}, n = [];
  return String(e || "").split(/\r?\n/).forEach((o) => {
    const s = /^#\s+(HELP|TYPE)\s+([^\s]+)\s+(.+)$/.exec(o);
    if (s) {
      t[s[2]] ||= {}, t[s[2]][s[1].toLowerCase()] = s[3];
      return;
    }
    if (!o || o.startsWith("#")) return;
    const r = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+([^\s]+)(?:\s+\d+)?$/.exec(o);
    if (!r) return;
    const l = Number(r[3]);
    if (!Number.isFinite(l)) return;
    const a = r[1].replace(/_(?:bucket|sum|count)$/, ""), c = t[r[1]] || (t[a]?.type === "histogram" ? t[a] : null);
    n.push({ name: r[1], labels: ut(r[2] || ""), value: l, type: c?.type || null, help: c?.help || null });
  }), n;
}
function he(e, t) {
  return e.filter((n) => n.name === t);
}
function ie(e, t, n = () => true) {
  const o = he(e, t).filter(n);
  return o.length ? o.reduce((s, r) => s + r.value, 0) : null;
}
function N(e, t) {
  return e.find((n) => n.name === t)?.value ?? null;
}
function pt(e, t, n) {
  const o = /* @__PURE__ */ new Map();
  he(e, `${t}_bucket`).forEach((u) => {
    const m = u.labels.le === "+Inf" ? 1 / 0 : Number(u.labels.le);
    Number.isNaN(m) || o.set(m, (o.get(m) || 0) + u.value);
  });
  const s = [...o.entries()].sort((u, m) => u[0] - m[0]);
  if (!s.length) return null;
  const r = s[s.length - 1][1];
  if (!r) return 0;
  const l = r * n;
  let a = 0, c = 0;
  for (const [u, m] of s) {
    if (m >= l) {
      if (!Number.isFinite(u)) return a;
      const v = u - a, y = m - c, f = y > 0 ? (l - c) / y : 0;
      return a + v * Math.max(0, Math.min(1, f));
    }
    a = u, c = m;
  }
  return null;
}
function Ae(e) {
  return he(e, "event").map((t) => ({ topic: t.labels.topic || "other", event: t.labels.event || "event", value: t.value })).sort((t, n) => n.value - t.value);
}
function ft(e) {
  return !/duration|elapsed|latency|runtime/i.test(`${e.topic} ${e.event}`);
}
function mt(e) {
  return (e || []).flatMap((t) => !t.value || typeof t.value != "object" || Array.isArray(t.value) ? [] : Object.entries(t.value).filter(([, n]) => Number.isFinite(Number(n))).map(([n, o]) => ({ topic: t.topic, event: n, value: Number(o) }))).sort((t, n) => n.value - t.value);
}
function ht(e) {
  return te.map((t) => e.reduce((n, o) => {
    const s = `${o.topic} ${o.event}`.toLowerCase();
    return n + (t.pattern.test(s) ? o.value : 0);
  }, 0));
}
function gt(e) {
  let t = 0, n = 0;
  return e.forEach((o) => {
    const s = `${o.topic} ${o.event}`.toLowerCase();
    /cache.*hit|hit.*cache/.test(s) && (t += o.value), /cache.*miss|miss.*cache/.test(s) && (n += o.value);
  }), t + n > 0 ? t / (t + n) * 100 : null;
}
function vt(e, t = []) {
  const n = Ae(e), o = n.length ? n : t, s = o.filter(ft), r = ie(e, "cowboy_requests_total", (a) => a.labels.status_class === "server-error"), l = { requests: ie(e, "cowboy_requests_total"), errors: r ?? ie(e, "cowboy_errors_total"), events: s.length ? s.reduce((a, c) => a + c.value, 0) : null, memory: N(e, "erlang_vm_memory_bytes"), processes: N(e, "erlang_vm_processes"), ports: N(e, "erlang_vm_ports"), runQueue: N(e, "erlang_vm_statistics_run_queues_length"), systemLoad: Number.isFinite(N(e, "system_load")) ? N(e, "system_load") / 256 : null, reductions: N(e, "erlang_vm_statistics_reductions_total"), networkIn: N(e, "erlang_vm_statistics_bytes_received_total"), networkOut: N(e, "erlang_vm_statistics_bytes_output_total"), outbound: N(e, "outbound_connections"), uptime: N(e, "process_uptime_seconds"), garbageCollections: N(e, "erlang_vm_statistics_garbage_collection_number_of_gcs_total"), latencyP95: pt(e, "cowboy_request_duration_seconds", 0.95), cacheHitRatio: gt(s) };
  return { values: de.map((a) => l[a.key] ?? null), workloads: ht(s), events: o, topEvents: o };
}
function yt(e) {
  const t = /* @__PURE__ */ new Map();
  return e.forEach((n) => {
    if (n.name === "process_info") return;
    const o = n.type === "histogram" ? n.name.replace(/_(?:bucket|sum|count)$/, "") : n.name, s = t.get(o) || { name: o, type: n.type, help: n.help, series: 0, value: null };
    s.series += 1, s.value = s.series === 1 && n.type !== "histogram" ? n.value : null, t.set(o, s);
  }), [...t.values()].sort((n, o) => n.name.localeCompare(o.name)).slice(0, 240);
}
function Q(e) {
  if (Array.isArray(e)) return e.map(Q);
  if (!e || typeof e != "object") return e;
  const t = {};
  return Object.entries(e).forEach(([n, o]) => {
    xe.has(n.toLowerCase()) || (t[n] = Q(o));
  }), t;
}
function bt(e) {
  return Object.entries(e || {}).filter(([t]) => !xe.has(t.toLowerCase()) && t !== "ao-types").map(([t, n]) => ({ topic: t.replace(/\+link$/, ""), link: t.endsWith("+link") ? String(n) : null, value: t.endsWith("+link") ? null : Q(n) })).filter((t) => t.topic !== "status").sort((t, n) => t.topic.localeCompare(n.topic));
}
async function wt(e, t = window.fetch.bind(window), { includeInfo: n = true } = {}) {
  const o = performance.now(), s = { accept: "application/json", "accept-bundle": "true" }, r = n ? q(t, `${e}/~meta@1.0/info`, { headers: s }).then(async (d) => {
    if (!d.ok) throw new Error(`info returned ${d.status}`);
    return U(d);
  }) : Promise.resolve(null), [l, a, c] = await Promise.allSettled([r, q(t, `${e}/~hyperbuddy@1.0/events`, { headers: s }).then(async (d) => {
    if (!d.ok) throw new Error(`events returned ${d.status}`);
    return U(d);
  }), q(t, `${e}/~hyperbuddy@1.0/metrics`, { headers: { accept: "text/plain" } }, 15e3).then(async (d) => {
    if (!d.ok) throw new Error(`metrics returned ${d.status}`);
    return Re(d, Ke);
  })]), u = l.status === "fulfilled" && !!l.value;
  if (!u && a.status === "rejected" && c.status === "rejected") throw new Error([l, a, c].map((d) => d.reason?.message).filter(Boolean).join("; "));
  const m = a.status === "fulfilled" ? bt(a.value) : [], v = c.status === "fulfilled" ? dt(c.value) : [], y = mt(m), f = vt(v, y), h = Ae(v).length > 0, w = h || a.status === "fulfilled";
  return { timestamp: Date.now(), latency: Math.round(performance.now() - o), info: u ? Q(l.value) : null, values: f.values, workloads: f.workloads, events: w ? f.events : null, topEvents: f.topEvents, eventSource: h ? "metrics" : y.length ? "events" : null, eventTopics: m, metricFamilies: yt(v), endpointErrors: { info: l.status === "rejected" ? l.reason.message : null, events: a.status === "rejected" ? a.reason.message : null, metrics: c.status === "rejected" ? c.reason.message : null } };
}
async function kt(e, t = window.fetch.bind(window)) {
  const n = await q(t, `${e}/~location@1.0/known`, { headers: { accept: "application/json", "accept-bundle": "true" } });
  if (!n.ok) return [];
  const o = await U(n, 256 * 1024), s = Object.entries(o).filter(([l, a]) => /^\d+$/.test(l) && typeof a == "string").map(([, l]) => l).slice(0, 24), r = [];
  for (let l = 0; l < s.length; l += 4) {
    const a = s.slice(l, l + 4);
    (await Promise.allSettled(a.map(async (u) => {
      const m = await q(t, `${e}/~location@1.0/${encodeURIComponent(u)}`, { headers: { accept: "application/json", "accept-bundle": "true" } });
      return m.ok ? Xe(await U(m, 256 * 1024), e) : null;
    }))).forEach((u) => {
      u.status === "fulfilled" && u.value && r.push(u.value);
    });
  }
  return r;
}
function Et(e, t) {
  e.eventKeys = Array.isArray(e.eventKeys) ? e.eventKeys : [];
  const n = new Map(e.eventKeys.map((r, l) => [JSON.stringify(r), l])), o = t.events === null ? null : (t.events || []).map((r) => {
    const l = JSON.stringify([r.topic, r.event]);
    return n.has(l) || (n.set(l, e.eventKeys.length), e.eventKeys.push([r.topic, r.event])), [n.get(l), r.value];
  }).sort(([r], [l]) => r - l);
  e.sampleSequence = (Number(e.sampleSequence) || 0) + 1;
  const s = { t: t.timestamp, seq: e.sampleSequence, pollMs: B(t.pollMs), ok: 1, latency: t.latency, values: t.values, workloads: t.workloads, events: o };
  return e.samples.push(s), e.samples = e.samples.slice(-1e3), e.status = "online", e.lastSeen = t.timestamp, e.lastChecked = t.timestamp, e.lastError = null, e.consecutiveFailures = 0, t.info && (e.info = t.info), e.topEvents = t.topEvents, e.eventSource = t.eventSource, e.eventTopics = t.eventTopics, e.metricFamilies = t.metricFamilies, e.endpointErrors = t.endpointErrors, s;
}
function St(e, t, n = D) {
  const o = Date.now();
  e.sampleSequence = (Number(e.sampleSequence) || 0) + 1, e.samples.push({ t: o, seq: e.sampleSequence, pollMs: B(n), ok: 0, latency: null, values: [], workloads: [], events: null }), e.samples = e.samples.slice(-1e3), e.status = "offline", e.consecutiveFailures = (Number(e.consecutiveFailures) || 0) + 1, e.lastChecked = o, e.lastError = ["AbortError", "TimeoutError"].includes(t?.name) ? "Timed out." : String(t?.message || t);
}
function j(e, t) {
  const n = de.findIndex((o) => o.key === t);
  return n < 0 ? [] : (e.samples || []).map((o, s) => ({ t: o.t, value: o.values?.[n], i: o.seq ?? s, pollMs: o.pollMs })).filter((o) => Number.isFinite(o.value));
}
function Ie(e, t) {
  const n = te.findIndex((o) => o.key === t);
  return n < 0 ? [] : (e.samples || []).map((o, s) => ({ t: o.t, value: o.workloads?.[n], i: o.seq ?? s, pollMs: o.pollMs })).filter((o) => Number.isFinite(o.value));
}
function ge(e, t, n) {
  const o = (e.eventKeys || []).findIndex((s) => s[0] === t && s[1] === n);
  return o < 0 ? [] : (e.samples || []).flatMap((s, r) => {
    if (!Array.isArray(s.events)) return [];
    let l = 0, a = s.events.length - 1, c = null;
    for (; l <= a; ) {
      const u = Math.floor((l + a) / 2), m = s.events[u];
      if (m[0] === o) {
        c = m;
        break;
      }
      m[0] < o ? l = u + 1 : a = u - 1;
    }
    return c && Number.isFinite(c[1]) ? [{ t: s.t, value: c[1], i: s.seq ?? r, pollMs: s.pollMs }] : [];
  });
}
function J(e, t, n = D * 1.6) {
  const o = Math.max(n, (Number(e.pollMs) || 0) * 1.6, (Number(t.pollMs) || 0) * 1.6);
  return t.t - e.t > o || Number.isInteger(t.i) && t.i !== e.i + 1;
}
function ve(e, t = D * 1.6) {
  if (e.length < 2) return null;
  const n = e[e.length - 1], o = e[e.length - 2], s = (n.t - o.t) / 1e3;
  return s <= 0 || n.value < o.value || J(o, n, t) ? null : (n.value - o.value) / s;
}
const p = { scanState: document.getElementById("scan-state"), refresh: document.getElementById("refresh-button"), addPeer: document.getElementById("add-peer-button"), filter: document.getElementById("peer-filter"), pollInterval: document.getElementById("poll-interval"), autoRefresh: document.getElementById("auto-refresh"), showUnreachable: document.getElementById("show-unreachable"), discoveryNote: document.getElementById("discovery-note"), nodeGrid: document.getElementById("node-grid"), cardTemplate: document.getElementById("node-card-template"), lastSampled: document.getElementById("last-sampled"), online: document.getElementById("stat-online"), onlineNote: document.getElementById("stat-online-note"), records: document.getElementById("stat-records"), activity: document.getElementById("stat-activity"), samples: document.getElementById("stat-samples"), addDialog: document.getElementById("add-peer-dialog"), addForm: document.getElementById("add-peer-form"), peerUrl: document.getElementById("peer-url"), peerLabel: document.getElementById("peer-label"), formNote: document.getElementById("peer-form-note"), nodeDialog: document.getElementById("node-dialog"), nodeDetail: document.getElementById("node-detail") }, L = ["#009af7", "#138a6d", "#6d5ce7", "#b26214", "#bd3442"], g = Je();

function hydrateSharedRoster(e, t = getCachedHyperbeamRoster()) {
  if (!t?.peers?.length) return t;
  t.peers.forEach((n) => {
    n.records?.length && ue(e, n.records);
    const o = Te(e, n.url), s = n.probe;
    if (s && Number(s.checkedAt) > Number(o.lastChecked || o.prefetchedCheckedAt || 0)) {
      o.prefetchedCheckedAt = Number(s.checkedAt), o.prefetchedLatency = Number.isFinite(s.responseTime) ? s.responseTime : null, s.online && (o.prefetchedLastSeen = Number(s.checkedAt)), o.status = s.status || (s.online ? "online" : "offline"), o.lastError = s.error || null, !o.info && s.info && (o.info = Q(s.info)), o.geo = n.geo || o.geo;
    } else n.geo && (o.geo = n.geo);
  });
  const n = Number(t.discovery?.updatedAt) || 0;
  return n > Number(e.discovery.lastRun || 0) && (e.discovery = { ...e.discovery, lastRun: n, records: Number(t.discovery.records) || 0, error: t.discovery.error || null, truncated: !!t.discovery.truncated }), t;
}

hydrateSharedRoster(g);
const STAT_HELP = Object.freeze({
  publicNodes: "Nodes discovered from AO location records that responded to at least one supported HyperBEAM telemetry endpoint in this browser.",
  locationRecords: "Valid AO scheduler-location and location records read from Arweave, plus location records learned from responding peers. Multiple records can describe one node.",
  publicActivity: "The combined per-second increase of non-duration HyperBEAM event counters across nodes that are currently online.",
  localHistory: "Telemetry samples retained in this browser. They power the charts and are saved locally; they are not uploaded by this page.",
  scrapeInterval: "How often this browser schedules another direct telemetry check for eligible nodes. Offline nodes use a longer retry backoff.",
  scrapeTime: "The browser-observed time required to receive this node's telemetry responses. It includes network latency and node processing time.",
  status: "The result of the latest direct telemetry check: online, offline, blocked by browser safety rules, or waiting to be sampled.",
  requests: "HTTP request throughput calculated from the change in the node's cumulative Cowboy request counter between adjacent samples.",
  errors: "Server-error throughput calculated from the node's HTTP 5xx or Cowboy error counters.",
  events: "HyperBEAM event throughput calculated from the increase in non-duration event counters between two adjacent successful samples.",
  memory: "Total memory currently reported by the node's Erlang/BEAM virtual machine.",
  processes: "The number of Erlang/BEAM processes currently running on the node.",
  ports: "The number of Erlang/BEAM ports currently open on the node.",
  runQueue: "The number of runnable processes waiting for Erlang scheduler time. Sustained growth can indicate CPU pressure.",
  systemLoad: "The system load value reported by the node, normalized from its telemetry representation.",
  reductions: "Erlang reductions per second. A reduction is the BEAM VM's unit for measuring computational work.",
  networkIn: "Bytes received per second, calculated from the change in the node's cumulative network counter.",
  networkOut: "Bytes sent per second, calculated from the change in the node's cumulative network counter.",
  outbound: "The current number of outbound connections reported by the node.",
  uptime: "How long the node process has been running since its most recent restart.",
  garbageCollections: "Erlang garbage-collection operations per second, calculated from the cumulative GC counter.",
  latencyP95: "The estimated 95th percentile of HTTP request lifetime from the node's Prometheus histogram. About 95% of measured requests completed at or below this value.",
  cacheHitRatio: "The percentage of classified cache lookups that were hits rather than misses.",
  history: "The number of telemetry samples retained locally for this node.",
  workload: "Per-second activity grouped by related HyperBEAM event names, such as compute, scheduling, storage, or gateway work.",
  eventCounter: "The per-second change in this cumulative HyperBEAM event counter. A rate needs two adjacent successful samples."
});
const DETAIL_HELP_KEYS = Object.freeze({ Status: "status", "Scrape time": "scrapeTime", Events: "events", Requests: "requests", Uptime: "uptime", History: "history" });
function addStatHelp(e, t, n = null) {
  const o = n || STAT_HELP[t];
  return o && (e.classList.add("stat-help"), e.dataset.tooltip = o, e.tabIndex = 0), e;
}
function setupStatTooltips() {
  const e = document.getElementById("stat-tooltip");
  if (!e) return;
  let t = null;
  const n = (a) => a?.closest?.("[data-stat-help], [data-tooltip]"), o = (a) => a?.dataset.tooltip || STAT_HELP[a?.dataset.statHelp], s = () => {
    t = null, e.hidden = true;
  }, r = (a) => {
    const c = o(a);
    if (!c) return;
    const u = a.closest("dialog") || document.body;
    e.parentElement !== u && u.append(e), t = a, e.textContent = c, e.hidden = false, a.hasAttribute("aria-label") || a.setAttribute("aria-label", `${a.textContent.trim()}. ${c}`);
    const m = a.getBoundingClientRect(), v = e.getBoundingClientRect(), y = Math.max(8, Math.min(window.innerWidth - v.width - 8, m.left + m.width / 2 - v.width / 2));
    let f = m.top - v.height - 10;
    f < 8 && (f = m.bottom + 10), e.style.left = `${y}px`, e.style.top = `${f}px`;
  };
  document.addEventListener("pointerover", (a) => {
    const c = n(a.target);
    c && c !== t && r(c);
  }), document.addEventListener("pointerout", (a) => {
    t && !t.contains(a.relatedTarget) && s();
  }), document.addEventListener("focusin", (a) => {
    const c = n(a.target);
    c && r(c);
  }), document.addEventListener("focusout", s), window.addEventListener("scroll", s, true), window.addEventListener("resize", s);
}
let z = null, ce = false, Y = 0, ne = null, T = "overview";
function i(e, t = null, n = null) {
  const o = document.createElement(e);
  return t && (o.className = t), n !== null && (o.textContent = String(n)), o;
}
function O(e, t = {}) {
  const n = document.createElementNS("http://www.w3.org/2000/svg", e);
  return Object.entries(t).forEach(([o, s]) => n.setAttribute(o, String(s))), n;
}
function G(e) {
  e.replaceChildren();
}
function $t(e) {
  return Number.isFinite(e) ? e : null;
}
function k(e, t = 1) {
  return Number.isFinite(e) ? new Intl.NumberFormat("en-US", { notation: Math.abs(e) >= 1e6 ? "compact" : "standard", maximumFractionDigits: t }).format(e) : "\u2014";
}
function Nt(e) {
  if (!Number.isFinite(e)) return "\u2014";
  const t = ["B", "KB", "MB", "GB", "TB"];
  let n = Math.abs(e), o = 0;
  for (; n >= 1e3 && o < t.length - 1; ) n /= 1e3, o += 1;
  return `${e < 0 ? "\u2212" : ""}${k(n, n < 10 ? 2 : 1)} ${t[o]}`;
}
function _t(e) {
  return Number.isFinite(e) ? e < 1 ? `${k(e * 1e3, 0)} ms` : e < 60 ? `${k(e, 1)} sec` : e < 3600 ? `${k(e / 60, 1)} min` : e < 86400 ? `${k(e / 3600, 1)} hr` : `${k(e / 86400, 1)} days` : "\u2014";
}
function ye(e) {
  if (!e) return "never";
  const t = Date.now() - e;
  return t < 5e3 ? "just now" : t < 6e4 ? `${Math.floor(t / 1e3)} sec ago` : t < 36e5 ? `${Math.floor(t / 6e4)} min ago` : t < 864e5 ? `${Math.floor(t / 36e5)} hr ago` : `${Math.floor(t / 864e5)} days ago`;
}
function X(e) {
  if (e.label) return e.label;
  try {
    return new URL(e.url).host;
  } catch {
    return e.url;
  }
}
function oe(e) {
  return de.find((t) => t.key === e);
}
function K(e) {
  return e.length ? e[e.length - 1] : null;
}
function De(e, t) {
  const n = oe(t), o = j(e, t);
  if (n?.kind !== "counter") return o;
  const s = [];
  for (let r = 1; r < o.length; r += 1) {
    const l = o[r - 1], a = o[r], c = (a.t - l.t) / 1e3;
    c > 0 && a.value >= l.value && !J(l, a, Number(g.settings.pollMs) * 1.6) && s.push({ t: a.t, value: (a.value - l.value) / c, i: a.i, pollMs: a.pollMs });
  }
  return s;
}
function Z(e, t) {
  return ve(j(e, t), Number(g.settings.pollMs) * 1.6);
}
function be(e) {
  return te.map((t) => ({ ...t, rate: ve(Ie(e, t.key), Number(g.settings.pollMs) * 1.6) })).filter((t) => Number.isFinite(t.rate) && t.rate > 0).sort((t, n) => n.rate - t.rate);
}
function Oe(e, t) {
  const n = Ie(e, t), o = [];
  for (let s = 1; s < n.length; s += 1) {
    const r = n[s - 1], l = n[s], a = l.t - r.t;
    a > 0 && !J(r, l, Number(g.settings.pollMs) * 1.6) && l.value >= r.value && o.push({ t: l.t, value: (l.value - r.value) / (a / 1e3), i: l.i, pollMs: l.pollMs });
  }
  return o;
}
function Mt(e, t, n) {
  const o = ge(e, t, n), s = [];
  for (let r = 1; r < o.length; r += 1) {
    const l = o[r - 1], a = o[r], c = a.t - l.t;
    c > 0 && !J(l, a, Number(g.settings.pollMs) * 1.6) && a.value >= l.value && s.push({ t: a.t, value: (a.value - l.value) / (c / 1e3), i: a.i, pollMs: a.pollMs });
  }
  return s;
}
function F(e, t, n = false) {
  const o = oe(e);
  return !o || !Number.isFinite(t) ? "\u2014" : o.unit === "bytes" ? `${Nt(t)}${n ? "/s" : ""}` : o.unit === "seconds" ? n ? `${k(t, 2)}/s` : _t(t) : o.unit === "percent" ? `${k(t, 1)}%` : `${k(t, t < 10 ? 2 : 1)}${n ? "/s" : ""}`;
}
function I(e, t) {
  p.scanState.className = `scan-state ${e}`, p.scanState.querySelector("span").textContent = t;
}
function se(e, { compact: t = false, color: n = L[0], formatValue: o = (E) => k(E, 2) } = {}) {
  const s = t ? 320 : 620, r = t ? 42 : 150, l = t ? 2 : 8, a = t ? 4 : 10, c = O("svg", { viewBox: `0 0 ${s} ${r}`, preserveAspectRatio: "none", class: t ? "" : "chart-svg" });
  if (!e.length) return c;
  const u = e.map((E) => E.value), m = e.map((E) => E.t), v = Math.min(...u), y = Math.max(...u), f = Math.min(...m), h = Math.max(...m), w = y - v || Math.max(Math.abs(y) * 0.05, 1), d = h - f || 1, b = e.map((E) => ({ ...E, x: l + (E.t - f) / d * (s - l * 2), y: r - a - (E.value - v) / w * (r - a * 2) }));
  t || [0.25, 0.5, 0.75].forEach((E) => {
    c.append(O("line", { x1: l, x2: s - l, y1: r * E, y2: r * E, class: "chart-grid-line" }));
  });
  let $ = "", _ = null;
  if (b.forEach((E) => {
    if (!_ || J(_, E, Number(g.settings.pollMs) * 1.6)) {
      if ($) {
        const x = O("path", { d: $, class: "chart-line" });
        x.style.stroke = n, c.append(x);
      }
      if (_) {
        const x = O("line", { x1: _.x, y1: _.y, x2: E.x, y2: E.y, class: "chart-line bridge" }), N = `No samples from ${new Date(_.t).toLocaleString()} to ${new Date(E.t).toLocaleString()} (${_t((E.t - _.t) / 1e3)} gap). The dotted line only connects the readings on either side; values within the gap are unknown.`;
        x.style.stroke = n, x.dataset.tooltip = N, c.append(x);
        const H = O("line", { x1: _.x, y1: _.y, x2: E.x, y2: E.y, class: "chart-gap-hit", tabindex: 0, "aria-label": N, "data-tooltip": N });
        c.append(H);
      }
      $ = `M ${E.x} ${E.y}`;
    } else $ += ` L ${E.x} ${E.y}`;
    _ = E;
  }), $) {
    const E = O("path", { d: $, class: "chart-line" });
    E.style.stroke = n, c.append(E);
  }
  if (!t) b.forEach((E) => {
    const x = `${new Date(E.t).toLocaleString()} \u00b7 ${o(E.value)}`, N = O("circle", { cx: E.x, cy: E.y, r: 7, class: "chart-point-hit", tabindex: 0, "aria-label": x, "data-tooltip": x });
    c.append(N);
  });
  const S = b[b.length - 1], R = O("circle", { cx: S.x, cy: S.y, r: t ? 2 : 3, class: "chart-dot" });
  return R.style.stroke = n, c.append(R), c;
}
function chartLegend() {
  const e = i("div", "chart-legend");
  return e.setAttribute("aria-label", "Chart line key"), e.append(i("span", "chart-legend-observed", "Solid: consecutive samples"), i("span", "chart-legend-gap", "Dotted: no samples; values unknown")), e;
}
function Pe(e) {
  return e.manual ? "manual" : e.records?.[0]?.family || "location";
}
function Ct(e, t) {
  return t ? [e.url, e.label, e.status, ...(e.records || []).flatMap((o) => [o.owner, o.family]), ...be(e).map((o) => o.label)].some((o) => String(o || "").toLowerCase().includes(t)) : true;
}
function xt() {
  const e = p.filter.value.trim().toLowerCase(), t = g.settings.showUnreachable;
  return Object.values(g.peers).filter((n) => it(n, t)).filter((n) => Ct(n, e)).sort((n, o) => (n.firstSeen || 0) - (o.firstSeen || 0) || X(n).localeCompare(X(o)));
}
function Lt(e, existingCard = null) {
  const card = existingCard || p.cardTemplate.content.firstElementChild.cloneNode(true);
  const awaitingTelemetry = !e.lastChecked && (e.checking || e.status === "unknown"), refreshingTelemetry = e.checking && !!e.lastChecked;
  const fullTitle = X(e), title = card.querySelector("h3"), url = card.querySelector(".node-url");
  e.label ? (title.textContent = fullTitle, title.title = fullTitle) : fitHostnameToElement(title, fullTitle), url.textContent = e.url, url.title = e.url;
  card.className = "node-card", card.querySelector(".card-loading")?.remove(), card.classList.add(e.status || "unknown"), e.checking && card.classList.add("checking"), refreshingTelemetry && card.classList.add("refreshing"), card.dataset.url = e.url, card.querySelector(".source-badge").textContent = Pe(e);
  const lastSample = e.samples?.[e.samples.length - 1];
  const displayedLatency = lastSample?.latency ?? e.prefetchedLatency;
  card.querySelector('[data-kpi="latency"]').textContent = $t(displayedLatency) === null ? "\u2014" : `${k(displayedLatency, 0)} ms`, card.querySelector('[data-kpi="events"]').textContent = F("events", Z(e, "events"), true), card.querySelector('[data-kpi="memory"]').textContent = F("memory", K(j(e, "memory"))?.value);
  const sparkline = card.querySelector(".sparkline"), eventPoints = De(e, "events");
  sparkline.replaceChildren(se(eventPoints.length ? eventPoints : j(e, "memory"), { compact: true, color: e.status === "online" ? L[0] : L[4] }));
  const pills = card.querySelector(".workload-pills"), workloads = be(e).slice(0, 4);
  pills.replaceChildren();
  workloads.length ? workloads.forEach((workload) => {
    pills.append(i("span", "pill", `${workload.label} \xB7 ${k(workload.rate, 1)}/s`));
  }) : e.status === "blocked" ? pills.append(i("span", "pill quiet", e.blockedReason || "Browser-blocked")) : e.endpointErrors?.metrics ? pills.append(i("span", "pill quiet", "Metadata only")) : pills.append(i("span", "pill quiet", "No activity delta yet"));
  if (awaitingTelemetry) {
    card.classList.add("awaiting-telemetry");
    const loading = i("div", "card-loading"), spinner = i("span", "loading-spinner"), copy = i("span", null, e.checking ? "Loading node telemetry\u2026" : "Waiting for node response\u2026");
    spinner.setAttribute("aria-hidden", "true"), loading.setAttribute("role", "status"), loading.append(spinner, copy), card.querySelector(".node-kpis").after(loading);
  }
  const lastCheck = card.querySelector(".last-check");
  if (refreshingTelemetry) {
    const spinner = i("span", "inline-loading-spinner"), copy = i("span", null, "Refreshing stats\u2026");
    spinner.setAttribute("aria-hidden", "true"), lastCheck.replaceChildren(spinner, copy);
  } else lastCheck.textContent = e.checking ? "Sampling\u2026" : e.lastChecked ? `${e.status} \xB7 ${ye(e.lastChecked)}` : e.prefetchedCheckedAt ? `${e.status} \xB7 prefetched ${ye(e.prefetchedCheckedAt)}` : e.blockedReason || "Queued for sampling";
  return card.querySelector(".text-button").onclick = () => ke(e.url), card;
}
function Tt() {
  const e = Object.values(g.peers), t = e.filter((a) => a.status === "online").length, n = e.filter((a) => a.probeable !== false).length, o = e.reduce((a, c) => a + (c.records?.length || 0), 0), s = e.reduce((a, c) => a + (c.samples?.length || 0), 0), r = e.filter((a) => a.status === "online").reduce((a, c) => a + (Z(c, "events") || 0), 0);
  p.online.textContent = k(t, 0), p.onlineNote.textContent = `of ${k(n, 0)} browser candidates`, p.records.textContent = k(g.discovery.records || o, 0), p.activity.textContent = r > 0 ? k(r, 1) : "\u2014", p.samples.textContent = k(s, 0);
  const l = Math.max(0, ...e.map((a) => a.lastChecked || 0));
  p.lastSampled.textContent = l ? `Latest sample ${ye(l)}` : "No samples yet";
}
function M() {
  const e = xt(), t = new Set(e.map((l) => l.url)), n = new Map([...p.nodeGrid.querySelectorAll(".node-card[data-url]")].map((l) => [l.dataset.url, l]));
  p.nodeGrid.querySelector(".empty-state")?.remove(), e.forEach((l) => {
    const a = n.get(l.url);
    a ? Lt(l, a) : p.nodeGrid.append(Lt(l));
  }), n.forEach((l, a) => {
    t.has(a) || l.remove();
  });
  if (!e.length) {
    const l = Y ? "No nodes match this view. Enable \u201CAll records\u201D to inspect unreachable locations." : "Discovering and sampling public HTTPS peers\u2026";
    p.nodeGrid.append(i("div", "empty-state", l));
  }
  Tt();
}
function A() {
  ze(g) || (p.discoveryNote.textContent = "Local history could not be saved; this session remains live.");
}
async function qe({ forceDiscovery: force = false } = {}) {
  p.discoveryNote.classList.add("loading"), p.discoveryNote.textContent = "Reading [scheduler-]location records\u2026";
  try {
    const e = await warmHyperbeamNodeCache({
      probe: false,
      geolocate: true,
      forceDiscovery: force,
      onUpdate: ({ phase: t, roster: n }) => {
        hydrateSharedRoster(g, n), t === "geolocation" ? p.discoveryNote.textContent = "Caching node locations for the globe\u2026" : t === "discovery" && (p.discoveryNote.textContent = `${n.discovery.records} location records cached`), A(), M();
      }
    });
    hydrateSharedRoster(g, e), p.discoveryNote.textContent = e.discovery.truncated ? `${e.discovery.records} newest records indexed \xB7 more on refresh` : `${e.discovery.records} records indexed \xB7 shared cache ready`, A(), M();
  } catch (e) {
    g.discovery.error = e.message, p.discoveryNote.textContent = "Discovery unavailable \xB7 using saved peers", A();
  } finally {
    p.discoveryNote.classList.remove("loading");
  }
}
async function we(e, { discoverPeers: t = true } = {}) {
  if (!e.probeable) {
    e.checking = false, e.status = "blocked";
    return;
  }
  e.checking = true, M(), refreshDetailLoading(e);
  try {
    const n = !e.info || !e.infoChecked || Date.now() - e.infoChecked > 18e5 || e.endpointErrors?.events && e.endpointErrors?.metrics, o = await wt(e.url, window.fetch.bind(window), { includeInfo: n });
    if (Et(e, { ...o, pollMs: g.settings.pollMs }), updateCachedHyperbeamProbe(e.url, { online: true, responseTime: o.latency, info: o.info }), o.info && (e.infoChecked = o.timestamp), t && (!e.locationsChecked || Date.now() - e.locationsChecked > 18e5)) {
      e.locationsChecked = Date.now();
      try {
        const s = await kt(e.url, window.fetch.bind(window));
        ue(g, s);
      } catch {
      }
    }
  } catch (n) {
    St(e, n, g.settings.pollMs), updateCachedHyperbeamProbe(e.url, { online: false, error: n?.message || String(n) });
  }
  e.checking = false, A(), M();
  if (ne === e.url && p.nodeDialog.open) {
    const n = p.nodeDialog.scrollTop;
    ae(), p.nodeDialog.scrollTop = n;
  }
}
async function Rt(e, t, n) {
  let o = 0, s = 0;
  const r = Array.from({ length: Math.min(t, e.length) }, async () => {
    for (; o < e.length; ) {
      const l = e[o];
      o += 1, await n(l), s += 1, I("working", `Sampling ${s}/${e.length}`);
    }
  });
  await Promise.all(r);
}
function At(e = false) {
  return Object.values(g.peers).filter((t) => lt(t, { force: e, pollMs: g.settings.pollMs })).sort((t, n) => {
    const o = (s) => s.status === "online" ? 0 : s.status === "unknown" ? 1 : 2;
    return o(t) - o(n) || (n.lastSeen || 0) - (t.lastSeen || 0);
  });
}
async function W({ force: e = false } = {}) {
  if (ce) return;
  const t = At(e);
  if (!t.length) {
    Y += 1, I("live", "Idle"), M(), ee();
    return;
  }
  ce = true, p.refresh.disabled = true, I("working", `Sampling 0/${t.length}`), await Rt(t, 6, (o) => we(o)), Y += 1, ce = false, p.refresh.disabled = false;
  const n = Object.values(g.peers).filter((o) => o.status === "online").length;
  I(n ? "live" : "error", n ? `${n} publicly accessible` : "No publicly accessible nodes"), M(), ee();
}
function ee() {
  z && clearTimeout(z), z = null, g.settings.autoRefresh && (z = setTimeout(() => W(), Number(g.settings.pollMs)));
}
function It(e, t) {
  const n = oe(e);
  return F(e, t, n?.kind === "counter");
}
function Dt(e, t, n) {
  const o = oe(t), s = De(e, t), r = i("article", "chart-card"), l = i("div", "chart-head"), a = i("div");
  a.append(addStatHelp(i("span", "chart-label", o.label), t));
  const c = K(s);
  if (a.append(i("strong", null, It(t, c?.value))), l.append(a), s.length > 1) {
    const v = s[s.length - 2], y = c.value - v.value, f = `${y >= 0 ? "+" : ""}${k(y, 2)} interval`;
    l.append(i("span", "chart-rate", f));
  }
  r.append(l);
  const u = i("div", "chart-frame");
  u.dataset.tooltip = STAT_HELP[t], u.tabIndex = 0, u.setAttribute("aria-label", `${o.label} chart. ${STAT_HELP[t]}`), u.append(se(s, { color: L[n % L.length], formatValue: (v) => F(t, v, o?.kind === "counter") })), r.append(u);
  const m = i("div", "chart-foot");
  return m.append(i("span", null, s.length ? new Date(s[0].t).toLocaleTimeString() : "No samples"), i("span", null, `${s.length} points`), i("span", null, s.length ? new Date(s[s.length - 1].t).toLocaleTimeString() : "")), r.append(m), r;
}
function Ot(e, t, n) {
  const o = Oe(e, t.key), s = i("article", "chart-card"), r = i("div", "chart-head"), l = i("div");
  l.append(addStatHelp(i("span", "chart-label", `${t.label} activity`), "workload"), i("strong", null, o.length ? `${k(o[o.length - 1].value, 2)}/s` : "\u2014")), r.append(l, addStatHelp(i("span", "chart-rate", "event-class rate"), "workload")), s.append(r);
  const a = i("div", "chart-frame");
  a.dataset.tooltip = STAT_HELP.workload, a.tabIndex = 0, a.setAttribute("aria-label", `${t.label} activity chart. ${STAT_HELP.workload}`), a.append(se(o, { color: L[n % L.length], formatValue: (v) => `${k(v, 2)}/s` })), s.append(a);
  const c = i("div", "chart-foot");
  return c.append(i("span", null, o.length ? new Date(o[0].t).toLocaleTimeString() : "No deltas"), i("span", null, `${o.length} points`), i("span", null, o.length ? new Date(o[o.length - 1].t).toLocaleTimeString() : "")), s.append(c), s;
}
function P(e, t) {
  const n = i("article", "detail-stat");
  return n.append(addStatHelp(i("span", null, e), DETAIL_HELP_KEYS[e]), i("strong", null, t)), n;
}
function Pt(e, t) {
  const n = e.endpointErrors || {};
  return (t === "info" ? [["~meta@1.0/info", n.info]] : t === "events" ? [["~hyperbuddy@1.0/events", n.events]] : t === "metrics" ? [["~hyperbuddy@1.0/metrics", n.metrics]] : Object.entries(n)).filter(([, s]) => s).map(([s, r]) => `${s}: ${r}`);
}
function re(e, t, n) {
  Pt(t, n).forEach((o) => {
    e.append(i("div", "endpoint-warning", o));
  });
}
function qt(e) {
  const t = i("section", "detail-panel");
  re(t, e, "overview");
  const n = e.samples?.[e.samples.length - 1], o = i("div", "detail-stats"), cachedLatency = n?.latency ?? e.prefetchedLatency;
  o.append(P("Status", e.status), P("Scrape time", Number.isFinite(cachedLatency) ? `${cachedLatency} ms` : "\u2014"), P("Events", F("events", Z(e, "events"), true)), P("Requests", F("requests", Z(e, "requests"), true)), P("Uptime", F("uptime", K(j(e, "uptime"))?.value)), P("History", `${e.samples?.length || 0} points`)), t.append(o);
  const s = i("div", "chart-grid");
  ["events", "requests", "memory", "processes", "runQueue", "errors", "networkIn", "latencyP95"].forEach((f, h) => s.append(Dt(e, f, h))), t.append(chartLegend(), s);
  const r = te.map((f) => ({ ...f, points: Oe(e, f.key) })).filter((f) => f.points.length).sort((f, h) => h.points[h.points.length - 1].value - f.points[f.points.length - 1].value).slice(0, 4);
  if (r.length) {
    t.append(i("h3", "subsection-heading", "Workload history"));
    const f = i("div", "chart-grid");
    r.forEach((h, w) => {
      f.append(Ot(e, h, w + 1));
    }), t.append(f);
  }
  const l = i("div", "overview-lower"), a = i("article", "panel-card");
  a.append(i("h3", null, "Workload activity"));
  const c = i("div", "activity-list"), u = be(e), m = Math.max(1, ...u.map((f) => f.rate));
  u.length ? u.slice(0, 10).forEach((f) => {
    const h = i("div", "activity-row");
    h.append(addStatHelp(i("span", null, f.label), "workload"));
    const w = i("div", "activity-track"), d = i("i");
    d.style.width = `${Math.max(2, f.rate / m * 100)}%`, w.append(d), h.append(w, i("strong", null, `${k(f.rate, 1)}/s`)), c.append(h);
  }) : c.append(i("p", "form-note", "A second telemetry sample will reveal interval activity.")), a.append(c);
  const v = i("article", "panel-card");
  v.append(i("h3", null, "Location provenance"));
  const y = i("div", "record-list");
  return e.records?.length ? e.records.forEach((f) => {
    const h = i("div", "record-row"), w = i("div"), d = f.expiresAt ? f.expiresAt < Date.now() : false;
    if (w.append(i("strong", null, `${f.family}${d ? " \xB7 stale" : ""}`), i("span", null, f.advertisedBy ? `${f.advertisedBy} \u2192 ${f.owner}` : f.owner || f.source)), h.append(w), f.transaction) {
      const b = i("a", null, "record \u2197");
      b.href = `https://arweave.net/${encodeURIComponent(f.transaction)}`, b.target = "_blank", b.rel = "noreferrer", h.append(b);
    } else h.append(i("span", null, ye(f.observedAt)));
    y.append(h);
  }) : y.append(i("p", "form-note", "Added manually; no network record is attached.")), v.append(y), l.append(a, v), t.append(l), t;
}
const Ne = [{ name: "Identity", pattern: /^(address|http-server|host|location-url|mode|on|port|protocol|variant|version)/ }, { name: "Compute & scheduling", pattern: /(compute|schedul|process|wasm|lua|cron|push|worker)/ }, { name: "Network", pattern: /(gateway|http|relay|rate-limit|connection|bundler|protocol)/ }, { name: "Storage & indexing", pattern: /(store|cache|lmdb|index|arweave|snapshot)/ }, { name: "Security", pattern: /(trusted|verify|commit|sign|auth|secret|paranoid|green-zone|tpm|lapee)/ }, { name: "Devices", pattern: /(device|preloaded)/ }, { name: "Debug & runtime", pattern: /(debug|log|test|monitor|prometheus)/ }];
function Fe(e) {
  return e.toLowerCase().replaceAll("_", "-");
}
function Ft(e) {
  const t = new Map(Ne.map((n) => [n.name, []]));
  return t.set("Other", []), Object.entries(e || {}).sort(([n], [o]) => n.localeCompare(o)).forEach(([n, o]) => {
    const s = Fe(n), r = Ne.find((l) => l.pattern.test(s));
    t.get(r?.name || "Other").push([n, o]);
  }), t;
}
function Bt(e) {
  const t = i("div", "meta-value");
  if (e == null) t.textContent = "\u2014";
  else if (typeof e == "boolean") t.append(i("span", "status-pill", e ? "true" : "false"));
  else if (typeof e == "number") t.textContent = k(e, 3);
  else if (typeof e == "string") if (/^https:\/\//i.test(e)) {
    const n = i("a", null, e);
    n.href = e, n.target = "_blank", n.rel = "noreferrer", t.append(n);
  } else t.textContent = e, e.length > 48 && (t.title = e);
  else {
    const n = i("details"), o = Array.isArray(e) ? e.length : Object.keys(e).length;
    n.append(i("summary", null, `${Array.isArray(e) ? "List" : "Message"} \xB7 ${o} items`));
    const s = i("pre");
    s.textContent = JSON.stringify(e, null, 2), n.append(s), t.append(n);
  }
  return t;
}
function Ht(e) {
  const t = i("section", "detail-panel");
  if (re(t, e, "info"), !e.info) return t.append(i("div", "empty-state", "No ~meta@1.0/info response has been retained for this node.")), t;
  const n = i("div", "meta-groups");
  return Ft(e.info).forEach((o, s) => {
    if (!o.length) return;
    const r = i("section", "meta-group");
    r.append(i("h3", null, s)), o.forEach(([l, a]) => {
      const c = i("div", "meta-row");
      c.append(i("div", "meta-key", Fe(l)), Bt(a)), r.append(c);
    }), n.append(r);
  }), t.append(n), t;
}
function Ut(e, t, n, o) {
  const s = i("div", "table-tools");
  s.append(i("p", null, `${t.length} retained entries`));
  const r = i("input", "table-filter");
  r.type = "search", r.placeholder = n, s.append(r), e.append(s);
  const l = i("div", "data-table"), a = () => {
    G(l);
    const c = r.value.trim().toLowerCase();
    t.filter((u) => JSON.stringify(u).toLowerCase().includes(c)).forEach((u) => l.append(o(u))), l.childElementCount || l.append(i("div", "empty-state", "No matching entries."));
  };
  r.addEventListener("input", a), a(), e.append(l);
}
function jt(e, t, n) {
  const o = Mt(e, t.topic, t.event), s = ge(e, t.topic, t.event), r = K(s), l = K(o)?.value, a = i("article", "chart-card event-chart-card"), c = i("div", "chart-head"), u = i("div");
  u.append(addStatHelp(i("span", "chart-label", C(t.event)), "eventCounter"), i("strong", null, Number.isFinite(l) ? `${k(l, 2)}/s` : "\u2014")), c.append(u, addStatHelp(i("span", "chart-rate", "delta / sec"), "eventCounter"));
  const m = i("div", "chart-frame");
  m.dataset.tooltip = STAT_HELP.eventCounter, m.tabIndex = 0, m.setAttribute("aria-label", `${C(t.event)} chart. ${STAT_HELP.eventCounter}`), m.append(se(o, { color: L[n % L.length], formatValue: (v) => `${k(v, 2)}/s` }));
  const v = i("div", "chart-foot");
  return v.append(i("span", null, `total ${k(r?.value, 0)}`), i("span", null, `${o.length} rate points`)), a.append(c, m, v), a;
}
function Gt(e, t) {
  const n = i("div", "event-row"), o = ve(ge(e, t.topic, t.event), Number(g.settings.pollMs) * 1.6);
  return n.append(addStatHelp(i("span", null, C(t.topic)), "eventCounter"), addStatHelp(i("span", null, C(t.event)), "eventCounter"), i("strong", null, Number.isFinite(o) ? `${k(t.value, 0)} \xB7 \u0394 ${k(o, 2)}/s` : k(t.value, 0))), n;
}
function Kt(e) {
  const t = i("section", "detail-panel");
  re(t, e, "events");
  const n = e.eventTopics?.length || 0, o = e.eventTopics?.filter((y) => y.link).length || 0, s = (e.eventKeys || []).map(([y, f]) => ({ topic: y, event: f })), r = e.eventSource === "metrics" ? "the Prometheus event family" : e.eventSource === "events" ? "the bundled events response" : "earlier successful scrapes";
  t.append(i("p", "form-note", `~hyperbuddy@1.0/events exposed ${n} groups${o ? ` (${o} remained linked)` : ""}. ${s.length} counters are retained from ${r}; per-second deltas require two adjacent samples.`), chartLegend());
  const l = i("div", "table-tools");
  l.append(i("p", null, `${s.length} charted events`));
  const a = i("input", "table-filter");
  a.type = "search", a.placeholder = "Filter group or event\u2026", l.append(a), t.append(l);
  const c = i("div", "event-history"), u = i("h3", "subsection-heading", "Current totals"), m = i("div", "data-table"), v = () => {
    G(c), G(m);
    const y = a.value.trim().toLowerCase(), f = ({ topic: d, event: b }) => `${C(d)} ${C(b)}`.toLowerCase().includes(y), h = s.filter(f), w = /* @__PURE__ */ new Map();
    h.forEach((d) => {
      w.has(d.topic) || w.set(d.topic, []), w.get(d.topic).push(d);
    }), [...w.entries()].sort(([d], [b]) => C(d).localeCompare(C(b))).forEach(([d, b], $) => {
      const _ = i("section", "event-group"), S = i("div", "event-group-head");
      S.append(i("h3", null, C(d)), i("span", null, `${b.length} event${b.length === 1 ? "" : "s"}`));
      const E = i("div", "chart-grid");
      b.sort((x, le) => C(x.event).localeCompare(C(le.event))).forEach((x, le) => {
        E.append(jt(e, x, $ + le));
      }), _.append(S, E), c.append(_);
    }), (e.topEvents || []).filter(f).forEach((d) => m.append(Gt(e, d))), c.childElementCount || c.append(i("div", "empty-state", "No matching event histories.")), m.childElementCount || m.append(i("div", "empty-state", "No matching current totals."));
  };
  return a.addEventListener("input", v), v(), t.append(c, u, m), t;
}
function Wt(e) {
  const t = i("section", "detail-panel");
  return re(t, e, "metrics"), t.append(i("p", "form-note", "Raw scrapes can approach 1 MB. This view retains compact family summaries and the chart signals above; high-cardinality process_info series stay out of localStorage.")), Ut(t, e.metricFamilies || [], "Filter metric families\u2026", (n) => {
    const o = i("div", "metric-row");
    return o.append(i("span", null, n.name), i("span", "metric-help", n.help || "\u2014"), i("span", null, `${n.series} series`), i("strong", null, k(n.value, 2))), o;
  }), t;
}
function refreshDetailLoading(e) {
  if (ne !== e.url || !p.nodeDialog.open) return;
  const t = p.nodeDetail.querySelector(".detail-actions");
  if (!t) return;
  let n = t.querySelector(".detail-refreshing");
  if (e.checking && e.lastChecked) {
    if (!n) {
      n = i("span", "detail-refreshing");
      const o = i("span", "inline-loading-spinner"), s = i("span", null, "Refreshing stats");
      o.setAttribute("aria-hidden", "true"), n.setAttribute("role", "status"), n.append(o, s), t.prepend(n);
    }
  } else n?.remove();
}
function ae() {
  const e = g.peers[ne];
  if (!e) {
    p.nodeDialog.close();
    return;
  }
  G(p.nodeDetail);
  const t = i("header", "detail-header"), n = i("div"), o = i("div", "detail-title-row"), s = i("i", "status-dot");
  e.status === "online" && (s.style.background = "var(--green)"), e.status === "offline" && (s.style.background = "var(--red)");
  const fullTitle = X(e), r = i("h2", null, fullTitle), subtitle = i("p", "detail-subtitle", `${e.url} \xB7 ${Pe(e)}`);
  r.id = "node-detail-title", e.label ? r.title = fullTitle : fitHostnameToElement(r, fullTitle), subtitle.title = e.url, o.append(s, r), n.append(o, subtitle);
  const l = i("div", "detail-actions"), a = i("a", "button quiet", "Visit node \u2197");
  a.href = e.url, a.target = "_blank", a.rel = "noreferrer";
  const c = i("button", "button quiet", "Sample now");
  c.type = "button", c.addEventListener("click", async () => {
    c.disabled = true, await we(e, { discoverPeers: false }), c.disabled = false;
  });
  const u = i("button", "icon-button", "\xD7");
  u.type = "button", u.setAttribute("aria-label", "Close dashboard"), u.addEventListener("click", () => p.nodeDialog.close()), l.append(a, c, u), t.append(n, l), p.nodeDetail.append(t);
  refreshDetailLoading(e);
  if (!e.lastChecked && (e.checking || e.status === "unknown" && e.probeable !== false)) {
    const m = i("div", "detail-loading"), v = i("span", "loading-spinner"), f = i("h3", null, e.checking ? "Loading node telemetry" : "Waiting to sample this node"), h = i("p", "form-note", "This dashboard will fill in automatically as soon as the node responds.");
    v.setAttribute("aria-hidden", "true"), m.setAttribute("role", "status"), m.append(v, f, h), p.nodeDetail.append(m);
    return;
  }
  const m = i("nav", "tab-list");
  m.setAttribute("role", "tablist");
  const v = [];
  [["overview", "Overview"], ["info", "Node info"], ["events", "Events"], ["metrics", "Metrics"]].forEach(([h, w]) => {
    const d = i("button", `tab-button${T === h ? " active" : ""}`, w);
    d.type = "button", d.id = `node-tab-${h}`, d.setAttribute("role", "tab"), d.setAttribute("aria-controls", `node-panel-${h}`), d.setAttribute("aria-selected", String(T === h)), d.tabIndex = T === h ? 0 : -1, d.addEventListener("click", () => {
      T = h, ae();
    }), m.append(d), v.push(d);
  }), m.addEventListener("keydown", (h) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(h.key)) return;
    h.preventDefault();
    const w = v.indexOf(document.activeElement), d = h.key === "Home" ? 0 : h.key === "End" ? v.length - 1 : (w + (h.key === "ArrowRight" ? 1 : -1) + v.length) % v.length;
    v[d].click(), document.getElementById(v[d].id)?.focus();
  }), p.nodeDetail.append(m);
  const f = { overview: qt, info: Ht, events: Kt, metrics: Wt }[T](e);
  f.id = `node-panel-${T}`, f.setAttribute("role", "tabpanel"), f.setAttribute("aria-labelledby", `node-tab-${T}`), p.nodeDetail.append(f);
}
function ke(e) {
  ne = e, T = "overview", ae(), p.nodeDialog.showModal(), history.replaceState(null, "", `#node=${encodeURIComponent(e)}`);
}
function Jt() {
  const e = /^#node=(.+)$/.exec(location.hash);
  if (e) try {
    const t = decodeURIComponent(e[1]);
    g.peers[t] && ke(t);
  } catch {
  }
}
function Vt() {
  p.pollInterval.value = String(g.settings.pollMs), p.autoRefresh.checked = g.settings.autoRefresh, p.showUnreachable.checked = g.settings.showUnreachable, p.filter.addEventListener("input", M), p.showUnreachable.addEventListener("change", () => {
    g.settings.showUnreachable = p.showUnreachable.checked, A(), M();
  }), p.autoRefresh.addEventListener("change", () => {
    g.settings.autoRefresh = p.autoRefresh.checked, A(), g.settings.autoRefresh ? W() : (ee(), I("live", "Paused"));
  }), p.pollInterval.addEventListener("change", () => {
    g.settings.pollMs = Number(p.pollInterval.value), A(), ee(), p.nodeDialog.open && ae();
  }), p.refresh.addEventListener("click", async () => {
    (g.discovery.truncated || !g.discovery.lastRun || Date.now() - g.discovery.lastRun > 18e5) && await qe({ forceDiscovery: true }), await W({ force: true });
  }), p.addPeer.addEventListener("click", () => {
    p.addForm.reset(), p.formNote.className = "form-note", p.formNote.textContent = "Manual peers and their samples are saved alongside discovered peers in localStorage.", p.addDialog.showModal(), p.peerUrl.focus();
  }), p.addDialog.querySelectorAll("[data-close-dialog]").forEach((e) => e.addEventListener("click", () => p.addDialog.close())), p.addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const t = rt(g, p.peerUrl.value, p.peerLabel.value);
      A(), M(), p.addDialog.close(), await we(t), ke(t.url);
    } catch (t) {
      p.formNote.className = "form-note error", p.formNote.textContent = t.message;
    }
  }), p.nodeDialog.addEventListener("close", () => {
    ne = null, history.replaceState(null, "", `${location.pathname}${location.search}`);
  }), p.nodeDialog.addEventListener("click", (e) => {
    e.target === p.nodeDialog && p.nodeDialog.close();
  });
}
async function zt() {
  Object.values(g.peers).forEach((t) => {
    t.checking = false;
    const n = me(t.url);
    t.probeable = n.ok, t.blockedReason = n.reason;
  }), setupStatTooltips(), Vt(), M(), Jt(), I("working", "Discovering");
  const e = qe();
  await Promise.race([e, new Promise((t) => setTimeout(t, 1500))]), g.settings.autoRefresh && await W(), await e, g.settings.autoRefresh ? await W() : (Y += 1, I("live", "Paused"), M());
}
zt();
