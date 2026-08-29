const GRAPHQL_ENDPOINT = 'https://arweave.net/graphql';
const DEFAULT_TIMEOUT_MS = 9000;
const MAX_JSON_BYTES = 512 * 1024;
const MAX_METRICS_BYTES = 2 * 1024 * 1024;

const RECORD_FAMILIES = [
    {
        family: 'scheduler-location',
        protocolTag: 'Data-Protocol',
        typeTag: 'Type',
        values: ['Scheduler-Location', 'Location'],
        sort: 'HEIGHT_DESC'
    },
    {
        family: 'location',
        protocolTag: 'data-protocol',
        typeTag: 'type',
        values: ['location'],
        sort: 'HEIGHT_DESC'
    },
    {
        family: 'superseded',
        protocolTag: 'data-protocol',
        typeTag: 'type',
        values: ['superseded'],
        sort: 'HEIGHT_ASC'
    }
];

export function normalizeNodeUrl(value) {
    const input = String(value || '').trim();
    if (!input) throw new Error('A node URL is required.');

    const candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
    const url = new URL(candidate);

    if (!/^https?:$/.test(url.protocol)) throw new Error('Node URLs must use HTTP or HTTPS.');
    if (url.username || url.password) throw new Error('Node URLs cannot contain credentials.');
    if (url.search || url.hash) throw new Error('Node URLs cannot contain a query or fragment.');
    if (url.port === '0') throw new Error('Node URLs cannot use port 0.');

    return url.origin;
}

/**
 * Shortens long DNS labels without hiding the recognizable domain structure.
 * For example, a 10-character limit renders a long label as `chip...yra`.
 * IPv4/IPv6 addresses and an optional numeric port are preserved.
 */
export function formatCompactHostname(value, maxLabelLength = 10) {
    const fullHostname = String(value || '').trim();
    const safeLimit = Math.max(7, Math.floor(Number(maxLabelLength) || 10));
    const colonCount = (fullHostname.match(/:/g) || []).length;
    if (!fullHostname || colonCount > 1) {
        return fullHostname;
    }

    const portMatch = /^(.*?)(:\d+)$/.exec(fullHostname);
    const hostname = portMatch ? portMatch[1] : fullHostname;
    const port = portMatch ? portMatch[2] : '';
    const headLength = Math.ceil((safeLimit - 3) / 2);
    const tailLength = Math.floor((safeLimit - 3) / 2);

    const compact = hostname.split('.').map(label =>
        label.length > safeLimit
            ? `${label.slice(0, headLength)}...${label.slice(-tailLength)}`
            : label
    ).join('.');

    return `${compact}${port}`;
}

/**
 * Keeps a hostname intact whenever its rendered container has enough room and
 * applies the compact-label form only when the full value actually overflows.
 */
export function fitHostnameToElement(element, value, maxLabelLength = 10) {
    if (!element) return;

    const fullHostname = String(value || '').trim();
    element.textContent = fullHostname;
    element.title = fullHostname;

    const fit = () => {
        if (!element.isConnected || element.clientWidth <= 0) return;
        element.textContent = fullHostname;
        if (element.scrollWidth > element.clientWidth) {
            element.textContent = formatCompactHostname(fullHostname, maxLabelLength);
        }
    };

    requestAnimationFrame(fit);
}

function isPrivateHostname(hostname) {
    const value = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (
        value === 'localhost' ||
        value.endsWith('.localhost') ||
        value.endsWith('.local') ||
        /^(0|10|127|169\.254)\./.test(value) ||
        /^192\.168\./.test(value)
    ) return true;

    const private172 = /^172\.(\d+)\./.exec(value);
    if (private172 && Number(private172[1]) >= 16 && Number(private172[1]) <= 31) return true;

    const carrierNat = /^100\.(\d+)\./.exec(value);
    return Boolean(
        (carrierNat && Number(carrierNat[1]) >= 64 && Number(carrierNat[1]) <= 127) ||
        value === '::1' ||
        /^f[cd][0-9a-f]{2}:/i.test(value) ||
        /^fe[89ab][0-9a-f]:/i.test(value)
    );
}

export function getProbeability(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:') return { ok: false, reason: 'HTTPS pages cannot poll an HTTP-only node.' };
        if (isPrivateHostname(url.hostname)) return { ok: false, reason: 'Private and loopback addresses are not polled.' };
        if (/hyperbeam-test-ignore|\.invalid$|\.example$|\.test$/i.test(url.hostname)) {
            return { ok: false, reason: 'Known test location record.' };
        }
        if (
            !url.hostname.includes('.') ||
            /(?:^|\.)(?:ngrok(?:-free)?\.(?:app|io)|loca\.lt|trycloudflare\.com)$/i.test(url.hostname)
        ) return { ok: false, reason: 'Ephemeral or non-public location record.' };
        return { ok: true, reason: null };
    } catch {
        return { ok: false, reason: 'Invalid URL.' };
    }
}

function tagValues(tags, name) {
    return (tags || []).filter(tag => tag?.name === name).map(tag => tag.value);
}

function ttlToMilliseconds(value, family) {
    const ttl = Number(value);
    if (!Number.isFinite(ttl) || ttl <= 0) return null;
    return family === 'scheduler-location' && ttl <= 86400 ? ttl * 1000 : ttl;
}

function parseLocationEdge(edge, family) {
    const node = edge?.node || {};
    const definition = RECORD_FAMILIES.find(item => item.family === family);
    if (!definition || family === 'superseded') return null;

    const typeTags = (node.tags || []).filter(tag => String(tag?.name).toLowerCase() === 'type');
    const protocols = tagValues(node.tags, definition.protocolTag);
    const urlTag = family === 'location' ? 'url' : 'Url';
    const ttlTag = family === 'location' ? 'time-to-live' : 'Time-To-Live';
    const urls = tagValues(node.tags, urlTag);
    const ttls = tagValues(node.tags, ttlTag);

    if (
        protocols.length !== 1 || protocols[0] !== 'ao' ||
        typeTags.length !== 1 || typeTags[0].name !== definition.typeTag ||
        !definition.values.includes(typeTags[0].value) ||
        urls.length !== 1 || ttls.length !== 1
    ) return null;

    let url;
    try {
        url = normalizeNodeUrl(urls[0]);
    } catch {
        return null;
    }

    const nonces = tagValues(node.tags, 'nonce');
    const nonce = Number(nonces[0]);
    if (family === 'location' && (nonces.length !== 1 || !Number.isSafeInteger(nonce) || nonce <= 0)) return null;

    const blockTimestamp = Number(node.block?.timestamp) * 1000 || null;
    const observedAt = family === 'location' && nonce > 1e12 ? nonce : blockTimestamp;
    const ttl = ttlToMilliseconds(ttls[0], family);
    if (!ttl) return null;

    const expiresAt = family === 'location' ? observedAt + ttl : null;
    return {
        url,
        family,
        owner: node.owner?.address || null,
        transaction: node.id || null,
        nonce: family === 'location' ? nonce : null,
        ttl,
        observedAt,
        expiresAt,
        stale: family === 'location' ? expiresAt < Date.now() : null,
        blockHeight: node.block?.height || null,
        source: 'arweave'
    };
}

function parseSupersededEdge(edge) {
    const node = edge?.node || {};
    const protocols = tagValues(node.tags, 'data-protocol');
    const types = tagValues(node.tags, 'type');
    const replacements = tagValues(node.tags, 'superseded-by');

    if (
        protocols.length !== 1 || protocols[0] !== 'ao' ||
        types.length !== 1 || types[0] !== 'superseded' ||
        replacements.length !== 1 || !node.owner?.address
    ) return null;

    return {
        owner: node.owner.address,
        supersededBy: replacements[0],
        transaction: node.id || null,
        nonce: Number(tagValues(node.tags, 'nonce')[0]) || null,
        blockHeight: node.block?.height || null,
        observedAt: Number(node.block?.timestamp) * 1000 || null
    };
}

function compareRecords(left, right) {
    if (left.family === 'location') {
        return (left.nonce || 0) - (right.nonce || 0) ||
            (left.blockHeight || 0) - (right.blockHeight || 0) ||
            (left.observedAt || 0) - (right.observedAt || 0) ||
            String(left.transaction || '').localeCompare(String(right.transaction || ''));
    }
    return (left.blockHeight || 0) - (right.blockHeight || 0) ||
        (left.observedAt || 0) - (right.observedAt || 0) ||
        String(left.transaction || '').localeCompare(String(right.transaction || ''));
}

function selectLatestRecords(records) {
    const latest = new Map();
    records.forEach(record => {
        const key = `${record.family}:${record.owner || record.transaction}`;
        const previous = latest.get(key);
        if (!previous || compareRecords(record, previous) > 0) latest.set(key, record);
    });
    return [...latest.values()];
}

function resolveSupersededOwners(records, supersededRecords) {
    const replacements = new Map();
    [...supersededRecords]
        .sort((left, right) => (left.blockHeight || 0) - (right.blockHeight || 0))
        .forEach(record => {
            if (!replacements.has(record.owner)) replacements.set(record.owner, record.supersededBy);
        });

    const resolveOwner = owner => {
        let current = owner;
        const seen = new Set();
        for (let depth = 0; current && depth < 10 && !seen.has(current) && replacements.has(current); depth += 1) {
            seen.add(current);
            current = replacements.get(current);
        }
        return current;
    };

    return records.map(record => {
        const owner = resolveOwner(record.owner);
        return {
            ...record,
            advertisedBy: owner !== record.owner ? record.owner : null,
            owner,
            resolvedOwner: owner,
            probeability: getProbeability(record.url)
        };
    });
}

function buildLocationQuery(definition) {
    const values = definition.values.map(value => JSON.stringify(value)).join(', ');
    return `
        query Locations($after: String) {
            transactions(
                tags: [
                    { name: ${JSON.stringify(definition.protocolTag)}, values: ["ao"] }
                    { name: ${JSON.stringify(definition.typeTag)}, values: [${values}] }
                ]
                first: 100
                after: $after
                sort: ${definition.sort}
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

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    return fetchImpl(url, {
        ...options,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        mode: 'cors',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs)
    });
}

async function readLimitedText(response, maxBytes) {
    const declaredSize = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) throw new Error(`response exceeds ${maxBytes} bytes`);

    if (!response.body?.getReader) {
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error(`response exceeds ${maxBytes} bytes`);
        return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let text = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel();
            throw new Error(`response exceeds ${maxBytes} bytes`);
        }
        text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
}

async function readLimitedJson(response, maxBytes = MAX_JSON_BYTES) {
    const value = JSON.parse(await readLimitedText(response, maxBytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('response is not a JSON message');
    return value;
}

async function fetchLocationPage(fetchImpl, definition, cursor) {
    const response = await fetchWithTimeout(fetchImpl, GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            query: buildLocationQuery(definition),
            variables: { after: cursor }
        })
    });

    if (!response.ok) throw new Error(`Arweave GraphQL returned ${response.status}.`);
    const body = await readLimitedJson(response, 1024 * 1024);
    if (body.errors?.length) throw new Error(body.errors[0].message);
    return body.data?.transactions || { edges: [], pageInfo: { hasNextPage: false } };
}

export async function discoverHyperbeamNodes({
    fetchImpl = window.fetch.bind(window),
    maxPages = 20,
    onProgress = () => {}
} = {}) {
    const records = [];
    const supersededRecords = [];
    let rawRecords = 0;
    let truncated = false;

    for (const definition of RECORD_FAMILIES) {
        let cursor = null;
        let completed = false;
        const familyRecords = [];

        for (let page = 1; page <= maxPages; page += 1) {
            const result = await fetchLocationPage(fetchImpl, definition, cursor);
            const parsedPage = [];
            result.edges.forEach(edge => {
                if (definition.family === 'superseded') {
                    const record = parseSupersededEdge(edge);
                    if (record) supersededRecords.push(record);
                } else {
                    const record = parseLocationEdge(edge, definition.family);
                    if (record) {
                        familyRecords.push(record);
                        parsedPage.push(record);
                    }
                }
            });

            if (definition.family !== 'superseded') rawRecords += parsedPage.length;
            onProgress({ family: definition.family, page, records: rawRecords, pageRecords: selectLatestRecords(parsedPage) });

            if (!result.pageInfo?.hasNextPage || result.edges.length === 0) {
                completed = true;
                break;
            }
            cursor = result.edges[result.edges.length - 1].cursor;
        }

        if (definition.family !== 'superseded') records.push(...selectLatestRecords(familyRecords));
        if (!completed && definition.family !== 'superseded') truncated = true;
    }

    const resolvedRecords = resolveSupersededOwners(records, supersededRecords);
    const peers = new Map();
    resolvedRecords.forEach(record => {
        const peer = peers.get(record.url) || {
            url: record.url,
            records: [],
            probeability: record.probeability
        };
        peer.records.push(record);
        peers.set(record.url, peer);
    });

    return {
        records: resolvedRecords,
        peers: [...peers.values()],
        rawRecords,
        truncated
    };
}

export async function probeHyperbeamNode(url, {
    fetchImpl = window.fetch.bind(window),
    includeTelemetry = false
} = {}) {
    const normalizedUrl = normalizeNodeUrl(url);
    const probeability = getProbeability(normalizedUrl);
    if (!probeability.ok) return { url: normalizedUrl, online: false, blocked: true, error: probeability.reason };

    const startedAt = performance.now();
    const jsonHeaders = { accept: 'application/json', 'accept-bundle': 'true' };
    const requests = [
        fetchWithTimeout(fetchImpl, `${normalizedUrl}/~meta@1.0/info`, { headers: jsonHeaders })
            .then(async response => {
                if (!response.ok) throw new Error(`info returned ${response.status}`);
                return readLimitedJson(response);
            })
    ];

    if (includeTelemetry) {
        requests.push(
            fetchWithTimeout(fetchImpl, `${normalizedUrl}/~hyperbuddy@1.0/events`, { headers: jsonHeaders })
                .then(async response => {
                    if (!response.ok) throw new Error(`events returned ${response.status}`);
                    return readLimitedJson(response);
                }),
            fetchWithTimeout(fetchImpl, `${normalizedUrl}/~hyperbuddy@1.0/metrics`, { headers: { accept: 'text/plain' } }, 15000)
                .then(async response => {
                    if (!response.ok) throw new Error(`metrics returned ${response.status}`);
                    return readLimitedText(response, MAX_METRICS_BYTES);
                })
        );
    }

    const results = await Promise.allSettled(requests);
    const online = results.some(result => result.status === 'fulfilled');
    const errors = results
        .filter(result => result.status === 'rejected')
        .map(result => result.reason?.message || String(result.reason));

    return {
        url: normalizedUrl,
        online,
        responseTime: Math.round(performance.now() - startedAt),
        info: results[0]?.status === 'fulfilled' ? results[0].value : null,
        errors,
        error: online ? null : errors.join('; ') || 'Node did not expose a supported endpoint.'
    };
}

export async function probeHyperbeamNodes(peers, {
    concurrency = 6,
    includeTelemetry = false,
    onProgress = () => {},
    fetchImpl = window.fetch.bind(window)
} = {}) {
    const candidates = peers.filter(peer => getProbeability(peer.url).ok);
    const results = [];
    let cursor = 0;
    let completed = 0;

    const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
        while (cursor < candidates.length) {
            const peer = candidates[cursor];
            cursor += 1;
            const result = await probeHyperbeamNode(peer.url, { fetchImpl, includeTelemetry });
            results.push({ ...peer, ...result });
            completed += 1;
            onProgress({ completed, total: candidates.length, peer, result });
        }
    });

    await Promise.all(workers);
    return results;
}

export const HYPERBEAM_ROSTER_CACHE_KEY = 'the-eye:hyperbeam-roster:v1';
export const HYPERBEAM_ROSTER_EVENT = 'the-eye:hyperbeam-roster-updated';
export const HYPERBEAM_NODE_CACHE_KEY = 'hyperbeam-field-view:v1';

const CACHE_VERSION = 1;
const DISCOVERY_CACHE_MS = 30 * 60 * 1000;
const PROBE_CACHE_MS = 5 * 60 * 1000;
const GEO_CACHE_MS = 30 * 24 * 60 * 60 * 1000;
const GEO_FAILURE_CACHE_MS = 6 * 60 * 60 * 1000;
const GEOLOCATION_ENDPOINT = 'https://ipaddress.to/api/lookup/';

let warmupPromise = null;
let activeRoster = null;

function emptyRoster() {
    return {
        version: CACHE_VERSION,
        updatedAt: 0,
        discovery: {
            updatedAt: 0,
            records: 0,
            rawRecords: 0,
            truncated: false,
            error: null
        },
        peers: []
    };
}

function normalizeCachedRoster(value) {
    if (!value || value.version !== CACHE_VERSION || !Array.isArray(value.peers)) return emptyRoster();

    const peers = [];
    const seen = new Set();
    value.peers.forEach(peer => {
        try {
            const url = normalizeNodeUrl(peer?.url);
            if (seen.has(url)) return;
            seen.add(url);
            peers.push({
                url,
                records: Array.isArray(peer.records) ? peer.records : [],
                probeability: getProbeability(url),
                probe: peer.probe && typeof peer.probe === 'object' ? peer.probe : null,
                geo: peer.geo && typeof peer.geo === 'object' ? peer.geo : null
            });
        } catch {
            // Ignore malformed cached peers.
        }
    });

    return {
        ...emptyRoster(),
        ...value,
        version: CACHE_VERSION,
        discovery: { ...emptyRoster().discovery, ...(value.discovery || {}) },
        peers
    };
}

function recordCacheKey(record) {
    return record.transaction
        ? `${record.source}|${record.transaction}|${record.url}`
        : `${record.source}|${record.owner || ''}|${record.nonce || ''}|${record.url}`;
}

function mergeCachedRecords(existing = [], incoming = []) {
    const records = new Map();
    [...existing, ...incoming].forEach(record => {
        if (record?.url) records.set(recordCacheKey(record), record);
    });
    return [...records.values()]
        .sort((left, right) => (right.observedAt || 0) - (left.observedAt || 0))
        .slice(0, 8);
}

function readNodeViewState(storage) {
    try {
        const value = JSON.parse(storage.getItem(HYPERBEAM_NODE_CACHE_KEY));
        if (value?.version === 1 && value.peers && typeof value.peers === 'object') return value;
    } catch {
        // Use an empty compatible cache below.
    }
    return {
        version: 1,
        peers: {},
        settings: { pollMs: 120000, autoRefresh: true, showUnreachable: false },
        discovery: { lastRun: null, records: 0, error: null, truncated: false }
    };
}

function mirrorRosterToNodeCache(roster, storage) {
    const state = readNodeViewState(storage);
    const now = Date.now();

    roster.peers.forEach(source => {
        const current = state.peers[source.url] || {
            url: source.url,
            label: null,
            manual: false,
            records: [],
            samples: [],
            status: 'unknown',
            firstSeen: now,
            lastSeen: null,
            lastChecked: null,
            lastError: null,
            info: null,
            topEvents: [],
            eventKeys: [],
            eventTopics: [],
            metricFamilies: [],
            sampleSequence: 0,
            consecutiveFailures: 0
        };
        current.records = mergeCachedRecords(current.records, source.records);
        current.probeable = source.probeability?.ok !== false;
        current.blockedReason = source.probeability?.reason || null;

        const probe = source.probe;
        if (probe && Number(probe.checkedAt) > Number(current.lastChecked || current.prefetchedCheckedAt || 0)) {
            current.prefetchedCheckedAt = Number(probe.checkedAt);
            current.prefetchedLatency = Number.isFinite(probe.responseTime) ? probe.responseTime : null;
            current.status = probe.status || (probe.online ? 'online' : 'offline');
            current.lastError = probe.error || null;
            if (probe.online) current.prefetchedLastSeen = Number(probe.checkedAt);
            if (!current.info && probe.info) current.info = probe.info;
        }
        if (source.geo) current.geo = source.geo;
        state.peers[source.url] = current;
    });

    if (Number(roster.discovery?.updatedAt) > Number(state.discovery?.lastRun || 0)) {
        state.discovery = {
            ...(state.discovery || {}),
            lastRun: Number(roster.discovery.updatedAt),
            records: Number(roster.discovery.records) || 0,
            error: roster.discovery.error || null,
            truncated: Boolean(roster.discovery.truncated)
        };
    }
    storage.setItem(HYPERBEAM_NODE_CACHE_KEY, JSON.stringify(state));
}

export function getCachedHyperbeamNodeCache(storage = window.localStorage) {
    const state = readNodeViewState(storage);
    const peers = Object.values(state.peers).flatMap(peer => {
        try {
            const url = normalizeNodeUrl(peer.url);
            let responseTime = Number.isFinite(peer.prefetchedLatency) ? peer.prefetchedLatency : null;
            for (let index = (peer.samples || []).length - 1; index >= 0; index -= 1) {
                if (Number.isFinite(peer.samples[index]?.latency)) {
                    responseTime = peer.samples[index].latency;
                    break;
                }
            }
            const status = peer.status === 'checking'
                ? (peer.lastSeen ? 'online' : 'unknown')
                : peer.status || 'unknown';
            return [{
                url,
                records: Array.isArray(peer.records) ? peer.records : [],
                probeability: getProbeability(url),
                probe: {
                    status,
                    online: status === 'online',
                    blocked: status === 'blocked',
                    responseTime,
                    info: peer.info || null,
                    error: peer.lastError || null,
                    checkedAt: Number(peer.lastChecked || peer.prefetchedCheckedAt) || 0
                },
                geo: peer.geo || null,
                firstSeen: Number(peer.firstSeen) || 0,
                lastSeen: Number(peer.lastSeen || peer.prefetchedLastSeen) || 0
            }];
        } catch {
            return [];
        }
    });
    return {
        version: 1,
        updatedAt: Math.max(
            Number(state.discovery?.lastRun) || 0,
            ...peers.map(peer => Number(peer.probe?.checkedAt) || 0)
        ),
        discovery: {
            updatedAt: Number(state.discovery?.lastRun) || 0,
            records: Number(state.discovery?.records) || 0,
            truncated: Boolean(state.discovery?.truncated),
            error: state.discovery?.error || null
        },
        peers
    };
}

export function getCachedHyperbeamRoster(storage = window.localStorage) {
    try {
        return normalizeCachedRoster(JSON.parse(storage.getItem(HYPERBEAM_ROSTER_CACHE_KEY)));
    } catch {
        return emptyRoster();
    }
}

function publishRoster(roster, { storage, onUpdate, phase }) {
    roster.updatedAt = Date.now();
    try {
        storage.setItem(HYPERBEAM_ROSTER_CACHE_KEY, JSON.stringify(roster));
        mirrorRosterToNodeCache(roster, storage);
    } catch (error) {
        console.warn('Could not cache the HyperBEAM roster:', error);
    }

    onUpdate({ phase, roster });
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(HYPERBEAM_ROSTER_EVENT, {
            detail: { phase, roster }
        }));
    }
}

function isFresh(timestamp, maxAge, now = Date.now()) {
    return Number(timestamp) > 0 && now - Number(timestamp) < maxAge;
}

async function runPool(items, concurrency, task) {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
        while (cursor < items.length) {
            const item = items[cursor];
            cursor += 1;
            await task(item);
        }
    });
    await Promise.all(workers);
}

function probeSnapshot(result) {
    const checkedAt = Date.now();
    return {
        status: result.blocked ? 'blocked' : result.online ? 'online' : 'offline',
        online: Boolean(result.online),
        blocked: Boolean(result.blocked),
        responseTime: Number.isFinite(result.responseTime) ? result.responseTime : null,
        info: result.info || null,
        error: result.error || null,
        checkedAt
    };
}

export async function geolocateHyperbeamNode(url, {
    fetchImpl = window.fetch.bind(window)
} = {}) {
    const normalizedUrl = normalizeNodeUrl(url);
    const hostname = new URL(normalizedUrl).hostname;
    const response = await fetchWithTimeout(
        fetchImpl,
        `${GEOLOCATION_ENDPOINT}${encodeURIComponent(hostname)}`,
        { headers: { accept: 'application/json' } },
        12000
    );
    if (!response.ok) throw new Error(`Geolocation returned ${response.status}.`);

    const body = await readLimitedJson(response, 128 * 1024);
    const latitude = Number(body.location?.latitude);
    const longitude = Number(body.location?.longitude);
    if (!body.success || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error(body.message || 'Geolocation did not return coordinates.');
    }

    const location = [body.location?.city, body.location?.state, body.location?.country]
        .filter(Boolean)
        .join(', ');
    return {
        ok: true,
        ip: body.resolved_ip || body.ip || null,
        lat: latitude,
        lng: longitude,
        location: location || body.location?.country || 'Location unavailable',
        country: body.location?.country_code || 'Unknown',
        timezone: body.location?.timezone || null,
        checkedAt: Date.now()
    };
}

export function updateCachedHyperbeamProbe(url, result, {
    storage = window.localStorage
} = {}) {
    const roster = activeRoster || getCachedHyperbeamRoster(storage);
    let normalizedUrl;
    try {
        normalizedUrl = normalizeNodeUrl(url);
    } catch {
        return roster;
    }

    let peer = roster.peers.find(item => item.url === normalizedUrl);
    if (!peer) {
        peer = { url: normalizedUrl, records: [], probeability: getProbeability(normalizedUrl), probe: null, geo: null };
        roster.peers.push(peer);
    }
    peer.probe = probeSnapshot({ url: normalizedUrl, ...result });
    publishRoster(roster, { storage, onUpdate: () => {}, phase: 'probe' });
    return roster;
}

async function performWarmup({
    fetchImpl,
    storage,
    forceDiscovery,
    forceProbe,
    probe,
    geolocate,
    probeConcurrency,
    geoConcurrency,
    onUpdate
}) {
    let roster = getCachedHyperbeamRoster(storage);
    activeRoster = roster;
    const now = Date.now();
    const needsDiscovery = forceDiscovery || !roster.peers.length ||
        !isFresh(roster.discovery.updatedAt, DISCOVERY_CACHE_MS, now);

    if (needsDiscovery) {
        try {
            const discovery = await discoverHyperbeamNodes({ fetchImpl });
            const previous = new Map(roster.peers.map(peer => [peer.url, peer]));
            roster.peers = discovery.peers.map(peer => ({
                ...peer,
                probe: previous.get(peer.url)?.probe || null,
                geo: previous.get(peer.url)?.geo || null
            }));
            roster.discovery = {
                updatedAt: Date.now(),
                records: discovery.records.length,
                rawRecords: discovery.rawRecords,
                truncated: discovery.truncated,
                error: null
            };
            publishRoster(roster, { storage, onUpdate, phase: 'discovery' });
        } catch (error) {
            roster.discovery.error = error?.message || String(error);
            publishRoster(roster, { storage, onUpdate, phase: 'discovery-error' });
        }
    } else {
        onUpdate({ phase: 'cache', roster });
    }

    const candidates = roster.peers.filter(peer => peer.probeability?.ok);
    const probes = probe
        ? candidates.filter(peer => forceProbe || !isFresh(peer.probe?.checkedAt, PROBE_CACHE_MS))
        : [];
    const locations = geolocate ? candidates.filter(peer => {
        const maxAge = peer.geo?.ok ? GEO_CACHE_MS : GEO_FAILURE_CACHE_MS;
        return !isFresh(peer.geo?.checkedAt, maxAge);
    }) : [];

    await Promise.all([
        runPool(probes, probeConcurrency, async peer => {
            try {
                peer.probe = probeSnapshot(await probeHyperbeamNode(peer.url, { fetchImpl }));
            } catch (error) {
                peer.probe = probeSnapshot({
                    url: peer.url,
                    online: false,
                    error: error?.message || String(error)
                });
            }
            publishRoster(roster, { storage, onUpdate, phase: 'probe' });
        }),
        runPool(locations, geoConcurrency, async peer => {
            try {
                peer.geo = await geolocateHyperbeamNode(peer.url, { fetchImpl });
            } catch (error) {
                peer.geo = {
                    ok: false,
                    error: error?.message || String(error),
                    checkedAt: Date.now()
                };
            }
            publishRoster(roster, { storage, onUpdate, phase: 'geolocation' });
        })
    ]);

    publishRoster(roster, { storage, onUpdate, phase: 'complete' });
    return roster;
}

export function warmHyperbeamNodeCache({
    fetchImpl = window.fetch.bind(window),
    storage = window.localStorage,
    forceDiscovery = false,
    forceProbe = false,
    probe = true,
    geolocate = true,
    probeConcurrency = 6,
    geoConcurrency = 3,
    onUpdate = () => {}
} = {}) {
    if (warmupPromise) return warmupPromise;
    warmupPromise = performWarmup({
        fetchImpl,
        storage,
        forceDiscovery,
        forceProbe,
        probe,
        geolocate,
        probeConcurrency,
        geoConcurrency,
        onUpdate
    }).finally(() => {
        warmupPromise = null;
        activeRoster = null;
    });
    return warmupPromise;
}
