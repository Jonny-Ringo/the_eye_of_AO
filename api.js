/**
 * API functions for fetching data from Arweave and AO Network
 */
import { dryrun } from "https://unpkg.com/@permaweb/aoconnect@0.0.82/dist/browser.js";
import {
    BLOCK_TRACKING_PROCESS,
    USE_VPS_ORACLE,
    BLOCKHEIGHT_API
} from './config.js';
import { generateQuery, generateArweaveTransactionQuery } from './processes.js';

// Cache for API responses
const responseCache = new Map();

// QGL Query Counter
let qglQueryCounter = 0;

const ARWEAVE_GRAPHQL_ENDPOINT = 'https://arweave-search.goldsky.com/graphql';
const BAZAR_GRAPHQL_PAGE_SIZE = 100;
const BAZAR_ORDER_ID_BATCH_SIZE = 75;
const BAZAR_SETTLEMENT_CACHE_KEY = 'bazar-completed-settlements';

async function fetchGraphql(query, variables = {}) {
    qglQueryCounter++;

    const response = await fetch(ARWEAVE_GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
        throw new Error(`GraphQL network error: ${response.status}`);
    }

    const payload = await response.json();
    if (payload.errors?.length) {
        throw new Error(payload.errors.map(error => error.message).join('; '));
    }

    return payload.data;
}

function tagsToObject(tags = []) {
    return Object.fromEntries(tags.map(tag => [String(tag.name).toLowerCase(), tag.value]));
}

async function fetchAllBazarPurchaseRegistrations(currentHeight) {
    const createQuery = maxHeight => `query BazarPurchaseRegistrations {
        transactions(
            first: ${BAZAR_GRAPHQL_PAGE_SIZE}
            sort: HEIGHT_DESC
            block: { min: 0, max: ${maxHeight} }
            tags: [{ name: "action", values: ["register-interest"] }]
        ) {
            count
            edges {
                node {
                    id
                    recipient
                    owner { address }
                    block { height timestamp }
                    tags { name value }
                }
            }
        }
    }`;

    const registrations = [];
    const seen = new Set();
    let maxHeight = Number(currentHeight);
    if (!Number.isFinite(maxHeight)) {
        throw new Error('A current block height is required for the Bazar sales scan');
    }

    for (let page = 0; page < 1000; page++) {
        const data = await fetchGraphql(createQuery(Math.floor(maxHeight)));
        const connection = data?.transactions;
        const edges = connection?.edges ?? [];

        for (const { node } of edges) {
            if (seen.has(node.id)) continue;
            seen.add(node.id);
            const tags = tagsToObject(node.tags);
            if (!tags['order-id'] || !node.recipient || !node.owner?.address || !node.block?.height) {
                continue;
            }

            registrations.push({
                id: node.id,
                orderId: tags['order-id'],
                processId: node.recipient,
                buyer: node.owner.address,
                height: Number(node.block.height),
            });
        }

        const remainingCount = Number(connection?.count ?? 0);
        if (remainingCount <= edges.length) {
            return registrations;
        }

        const oldestHeight = Math.min(...edges.map(edge => Number(edge.node.block?.height)));
        if (!Number.isFinite(oldestHeight) || oldestHeight <= 0 || oldestHeight > maxHeight) {
            throw new Error('Bazar purchase registration block pagination stalled');
        }
        maxHeight = oldestHeight - 1;
    }

    throw new Error('Bazar purchase registration pagination exceeded its safety limit');
}

async function fetchBazarOrderTransactions(orderIds, currentHeight) {
    const createQuery = maxHeight => `query BazarOrderTransactions($orderIds: [String!]!) {
        transactions(
            first: ${BAZAR_GRAPHQL_PAGE_SIZE}
            sort: HEIGHT_DESC
            block: { min: 0, max: ${maxHeight} }
            tags: [{ name: "order-id", values: $orderIds }]
        ) {
            count
            edges {
                node {
                    id
                    recipient
                    owner { address }
                    quantity { winston }
                    block { height timestamp }
                    tags { name value }
                }
            }
        }
    }`;

    const transactions = [];
    const seen = new Set();
    let maxHeight = Number(currentHeight);

    for (let page = 0; page < 1000; page++) {
        const data = await fetchGraphql(createQuery(Math.floor(maxHeight)), { orderIds });
        const connection = data?.transactions;
        const edges = connection?.edges ?? [];
        for (const { node } of edges) {
            if (!seen.has(node.id)) {
                seen.add(node.id);
                transactions.push(node);
            }
        }

        const remainingCount = Number(connection?.count ?? 0);
        if (remainingCount <= edges.length) {
            return transactions;
        }

        const oldestHeight = Math.min(...edges.map(edge => Number(edge.node.block?.height)));
        if (!Number.isFinite(oldestHeight) || oldestHeight <= 0 || oldestHeight > maxHeight) {
            throw new Error('Bazar order transaction block pagination stalled');
        }
        maxHeight = oldestHeight - 1;
    }

    throw new Error('Bazar order transaction pagination exceeded its safety limit');
}

/**
 * Finds completed Bazar purchases by correlating each register-interest transaction
 * with the later native-AR payment that Bazar assigns to the same asset process.
 * This deliberately charts settlement payments, not merely submitted purchases.
 */
async function fetchBazarCompletedSettlements(currentHeight) {
    const cached = responseCache.get(BAZAR_SETTLEMENT_CACHE_KEY);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
        return cached.data;
    }

    const registrations = await fetchAllBazarPurchaseRegistrations(currentHeight);
    const registrationsByOrderId = new Map();

    for (const registration of registrations) {
        const matches = registrationsByOrderId.get(registration.orderId) ?? [];
        matches.push(registration);
        registrationsByOrderId.set(registration.orderId, matches);
    }

    const orderIds = [...registrationsByOrderId.keys()];
    const batches = [];
    for (let index = 0; index < orderIds.length; index += BAZAR_ORDER_ID_BATCH_SIZE) {
        batches.push(orderIds.slice(index, index + BAZAR_ORDER_ID_BATCH_SIZE));
    }

    const transactionBatches = await Promise.all(
        batches.map(batch => fetchBazarOrderTransactions(batch, currentHeight))
    );
    const settlements = new Map();

    for (const node of transactionBatches.flat()) {
        const tags = tagsToObject(node.tags);
        const orderId = tags['order-id'];
        const assignedProcessId = tags['assign-to'];
        const paymentWinston = String(node.quantity?.winston ?? '');
        const paymentHeight = Number(node.block?.height);
        const paymentTimestamp = Number(node.block?.timestamp);

        // Bazar's payment transaction has order-id + assign-to, is signed by the
        // registering buyer, and targets the seller instead of the asset process.
        if (!orderId || !assignedProcessId || !node.owner?.address || !/^[1-9]\d*$/.test(paymentWinston) ||
            !Number.isFinite(paymentHeight) || !Number.isFinite(paymentTimestamp)) {
            continue;
        }

        const matchingRegistration = (registrationsByOrderId.get(orderId) ?? []).find(registration =>
            registration.buyer === node.owner.address &&
            registration.processId === assignedProcessId &&
            registration.id !== node.id &&
            registration.height <= paymentHeight &&
            node.recipient !== registration.processId
        );

        if (matchingRegistration) {
            settlements.set(node.id, {
                id: node.id,
                height: paymentHeight,
                timestamp: paymentTimestamp,
            });
        }
    }

    const data = [...settlements.values()];
    responseCache.set(BAZAR_SETTLEMENT_CACHE_KEY, { data, timestamp: Date.now() });
    console.log(`[API] Matched ${data.length} completed Bazar settlement payments from ${registrations.length} submitted purchases`);
    return data;
}

async function fetchBazarCompletedSales(periods, currentHeight) {
    const settlements = await fetchBazarCompletedSettlements(currentHeight);
    const chainTip = Number(currentHeight);

    return periods.map(period => {
        const startHeight = Number(period.startHeight);
        const requestedEndHeight = Number(period.endHeight);
        const endHeight = Number.isFinite(chainTip)
            ? Math.min(requestedEndHeight, chainTip)
            : requestedEndHeight;

        return {
            timestamp: period.endTime,
            count: settlements.filter(settlement =>
                settlement.height >= startHeight && settlement.height <= endHeight
            ).length,
        };
    });
}

/**
 * Fetches the current Arweave network information
 * @returns {Promise<Object>} Network info including current block height
 */
export async function fetchNetworkInfo() {
    try {
        const cacheKey = 'network-info';
        // Use cached data if it's less than 5 minutes old
        if (responseCache.has(cacheKey)) {
            const { data, timestamp } = responseCache.get(cacheKey);
            if (Date.now() - timestamp < 5 * 60 * 1000) {
                return data;
            }
        }

        const response = await fetch("https://arweave.net/info", { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`Network error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();

        // Some gateways return both `height` and `blocks`. Treat the higher as the canonical tip.
        // This prevents the UI from getting stuck if one field lags behind the other.
        const heightNum = Number(data?.height);
        const blocksNum = Number(data?.blocks);
        const candidates = [heightNum, blocksNum].filter(n => Number.isFinite(n) && n > 0);
        const canonicalTip = candidates.length ? Math.max(...candidates) : data?.height;

        data.gateway_height_raw = data.height;
        data.gateway_blocks_raw = data.blocks;
        data.height = canonicalTip;
        data.blocks = canonicalTip;
        data.tipHeight = canonicalTip;
        
        // Cache the result
        responseCache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
        
        return data;
    } catch (error) {
        console.error("Error fetching network info:", error);
        throw error;
    }
}

/**
 * Fetches block history from VPS Oracle or fallback to Lua Oracle
 * @param {number} days - Number of days of blockheight data to fetch (default: 730)
 * @returns {Promise<Array>} Array of block data with dates and heights
 */
export async function fetchBlockHistory(days = 730) {
    try {
        const cacheKey = 'block-history';
        // Use cached data if it's less than 15 minutes old
        if (responseCache.has(cacheKey)) {
            const { data, timestamp } = responseCache.get(cacheKey);
            if (Date.now() - timestamp < 15 * 60 * 1000) {
                return data;
            }
        }

        let blockData;

        if (USE_VPS_ORACLE) {
            // Fetch from VPS Oracle
            console.log('[API] Fetching blockheight data from VPS Oracle...');

            const response = await fetch(
                `${BLOCKHEIGHT_API}/daily?days=${days}`,
                {
                    signal: AbortSignal.timeout(10000) // 10 second timeout
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to fetch blockheight data from VPS Oracle');
            }

            // Transform VPS Oracle format to match existing Lua Oracle format
            // VPS uses snake_case (block_height), frontend expects camelCase (blockHeight)
            blockData = result.data.map(block => ({
                date: block.date,
                blockHeight: block.block_height,  // Transform snake_case to camelCase
                timestamp: block.timestamp_ms
            }));

            console.log(`[API] Successfully fetched ${blockData.length} days of blockheight data from VPS Oracle`);
        } else {
            // Fallback to Lua Oracle on AO
            console.log('[API] Fetching blockheight data from Lua Oracle (AO)...');

            const blockHistoryResponse = await dryrun({
                process: BLOCK_TRACKING_PROCESS,
                data: '',
                tags: [
                    { name: "Action", value: "BlocksHistory" },
                    { name: "Data-Protocol", value: "ao" },
                    { name: "Type", value: "Message" },
                    { name: "Variant", value: "ao.TN.1" }
                ],
            });

            if (
                !blockHistoryResponse ||
                !blockHistoryResponse.Messages ||
                !blockHistoryResponse.Messages[0] ||
                !blockHistoryResponse.Messages[0].Tags
            ) {
                throw new Error("Invalid block history response from Lua Oracle");
            }

            const dailyBlocksTag = blockHistoryResponse.Messages[0].Tags.find(
                tag => tag.name === "DailyBlocks"
            );

            if (!dailyBlocksTag) {
                throw new Error("No DailyBlocks tag found in Lua Oracle response");
            }

            blockData = JSON.parse(dailyBlocksTag.value);
            console.log(`[API] Successfully fetched ${blockData.length} days of blockheight data from Lua Oracle`);
        }

        // Sort blocks by date (descending) - works for both Oracle types
        const sortedData = blockData.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Cache the result
        responseCache.set(cacheKey, {
            data: sortedData,
            timestamp: Date.now()
        });

        return sortedData;
    } catch (error) {
        console.error("[API] Error fetching block history:", error);
        throw error;
    }
}

/**
 * Fetches transaction counts for a specific process type over multiple time periods
 * @param {string} processName - The name of the process
 * @param {Array} periods - Array of time periods with start/end heights
 * @param {number} currentHeight - Current blockchain height
 * @returns {Promise<Array>} Array of transaction counts for each period
 */
export async function fetchProcessData(processName, periods, currentHeight) {
    try {
        // Create a unique cache key for this request
        const cacheKey = `${processName}-${JSON.stringify(periods.map(p => p.startHeight + '-' + p.endHeight))}`;
        
        // Check if we have cached data that's less than 10 minutes old
        if (responseCache.has(cacheKey)) {
            const { data, timestamp } = responseCache.get(cacheKey);
            if (Date.now() - timestamp < 10 * 60 * 1000) {
                return data;
            }
        }

        // Bazar sales are a correlated two-transaction metric, so they cannot use
        // the single transactions.count query path below.
        if (processName === 'bazarSalesDaily') {
            const results = await fetchBazarCompletedSales(periods, currentHeight);
            responseCache.set(cacheKey, { data: results, timestamp: Date.now() });
            return results;
        }
        
        // Process all periods in chunks (5 at a time) to avoid overwhelming the server
        const CHUNK_SIZE = 10;
        const results = [];
        
        for (let i = 0; i < periods.length; i += CHUNK_SIZE) {
            const chunk = periods.slice(i, i + CHUNK_SIZE);
            
            // Process chunk in parallel
            const chunkResults = await Promise.all(chunk.map(async (period, index) => {
                try {
                    const query = await generateQuery(
                        processName,
                        period.startHeight,
                        period.endHeight,
                        currentHeight
                    );
                    
                    qglQueryCounter++;
                    
                    const response = await fetch(ARWEAVE_GRAPHQL_ENDPOINT, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query }),
                    });
                    
                    if (!response.ok) {
                        throw new Error(`Network error: ${response.status}`);
                    }
                    
                    const result = await response.json();
                    if (result.errors) {
                        console.error(`GraphQL errors for ${processName}:`, result.errors);
                        return {
                            timestamp: period.endTime,
                            count: 0
                        };
                    }
                    
                    return {
                        timestamp: period.endTime,
                        count: result.data.transactions.count
                    };
                } catch (error) {
                    console.error(`Error fetching data for ${processName} (period ${i + index}):`, error);
                    return {
                        timestamp: period.endTime,
                        count: 0
                    };
                }
            }));
            
            results.push(...chunkResults);
            
            // Add a small delay between chunks to avoid rate limiting
            if (i + CHUNK_SIZE < periods.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        // Cache the results
        responseCache.set(cacheKey, {
            data: results,
            timestamp: Date.now()
        });
        
        return results;
    } catch (error) {
        console.error(`Error fetching process data for ${processName}:`, error);
        throw error;
    }
}

/**
 * Fetches Arweave bundle item analytics from the backend API and merges with AO messages
 * @param {Array} periods - Array of {startHeight, endHeight, endTime} objects
 * @param {number} currentHeight - Current block height
 * @returns {Promise<Array>} Array of daily buckets with breakdowns
 */
export async function fetchArweaveTransactionAnalytics(periods, currentHeight) {
    try {
        const days = periods.length;

        const configuredBackendUrl = import.meta.env.VITE_ANALYTICS_API_URL?.trim();
        if (!configuredBackendUrl) {
            throw new Error('VITE_ANALYTICS_API_URL is not configured');
        }

        const backendUrl = configuredBackendUrl.replace(/\/$/, '');

        // Include date range in cache key so the chart can roll over cleanly at UTC midnight.
        const periodDates = periods
            .map(p => (p?.startTime || p?.endTime))
            .filter(Boolean)
            .map(d => d.toISOString().split('T')[0]);

        const uniquePeriodDates = Array.from(new Set(periodDates)).sort();
        const rangeKey = uniquePeriodDates.length
            ? `${uniquePeriodDates[0]}-${uniquePeriodDates[uniquePeriodDates.length - 1]}`
            : 'unknown-range';

        const cacheKey = `arweave-bundle-items-${days}-${rangeKey}`;

        // Check cache (5 minute TTL)
        if (responseCache.has(cacheKey)) {
            const { data, timestamp } = responseCache.get(cacheKey);
            if (Date.now() - timestamp < 5 * 60 * 1000) {
                console.log('[Bundle Analytics] Using cached data for', days, 'days');
                return data;
            }
        }

        console.log(`[Bundle Analytics] Fetching ${days} days from backend and GraphQL...`);

        // Fetch bundle items from backend and AO messages + totals from GraphQL in parallel
        const [bundleResponse, aoData, totalData] = await Promise.all([
            fetch(`${backendUrl}/api/arweave/bundle-items/daily?days=${days}`),
            fetchAOMessageCounts(periods, currentHeight, 'startTime'),
            fetchTotalTransactionCounts(periods, currentHeight, 'startTime')
        ]);

        if (!bundleResponse.ok) {
            throw new Error(`Backend API error: ${bundleResponse.status}`);
        }

        const responseContentType = bundleResponse.headers.get('content-type') || '';
        if (!responseContentType.toLowerCase().includes('application/json')) {
            throw new Error(
                `Analytics API returned ${responseContentType || 'an unknown content type'} instead of JSON`
            );
        }

        const bundleResult = await bundleResponse.json();

        const backendData = Array.isArray(bundleResult?.data) ? bundleResult.data : [];
        console.log(`[Bundle Analytics] Backend returned ${backendData.length} days of data`);

        // Map backend aggregates by date string (YYYY-MM-DD). Backend may not have "today" yet.
        const backendByDate = new Map(
            backendData
                .filter(row => row && typeof row.date === 'string')
                .map(row => [row.date, row])
        );

        // Create map of AO messages by date
        const aoByDate = new Map(aoData.map(item => [item.date, item.count]));

        // Create map of total transactions by date
        const totalByDate = new Map(totalData.map(item => [item.date, item.count]));

        console.log('[Bundle Analytics] AO data by date:', Object.fromEntries(aoByDate));
        console.log('[Bundle Analytics] Total TX data by date:', Object.fromEntries(totalByDate));

        // Always build buckets from the frontend periods (UTC day slots), not from backend rows.
        // This ensures the "new day" appears immediately at 00:00 UTC even if the backend hasn't produced data yet.
        const buckets = uniquePeriodDates.map(dateStr => {
            const backendBucket = backendByDate.get(dateStr);

            const redstoneItems = Number(backendBucket?.redstone_items || 0);
            const ardriveItems = Number(backendBucket?.ardrive_items || 0);
            const arioItems = Number(backendBucket?.ario_items || 0);
            const kyveItems = Number(backendBucket?.kyve_items || 0);

            const aoCount = Number(aoByDate.get(dateStr) || 0);
            const totalTx = Number(totalByDate.get(dateStr) || 0);

            const bundleItems = redstoneItems + ardriveItems + arioItems + kyveItems;

            // GOLDSKY CHANGE FIX: GQL total now excludes Redstone unbundled txs.
            // Add redstone_items to the GQL total to get the actual total count.
            const adjustedTotal = totalTx + redstoneItems;

            // Guard: sometimes GraphQL totals lag/miss data for a day.
            // Ensure the displayed total is never lower than the sum of known groups.
            const calculatedMinTotal = bundleItems + aoCount;
            const total = Math.max(adjustedTotal, calculatedMinTotal);
            const other = Math.max(0, total - calculatedMinTotal);

            console.log(
                `[Bundle Analytics] ${dateStr}: gqlTotal(${totalTx}) + redstoneItems(${redstoneItems}) = adjusted(${adjustedTotal}) vs calcMin(${calculatedMinTotal}) -> total(${total}); redstone(${redstoneItems}) + ardrive(${ardriveItems}) + ario(${arioItems}) + kyve(${kyveItems}) + ao(${aoCount}) + other(${other}) = ${total}`
            );

            return {
                date: dateStr,
                total,
                redstone: redstoneItems,
                ardrive: ardriveItems,
                ario: arioItems,
                kyve: kyveItems,
                ao: aoCount,
                other
            };
        });

        // Cache the result
        responseCache.set(cacheKey, {
            data: buckets,
            timestamp: Date.now()
        });

        console.log(`Fetched ${buckets.length} days of bundle item analytics (period-driven)`);
        return buckets;

    } catch (error) {
        console.error('Error fetching Arweave bundle analytics:', error);
        // Return empty array on error
        return [];
    }
}

/**
 * Fetches AO message counts per day
 */
async function fetchAOMessageCounts(periods, currentHeight, dateKey = 'endTime') {
    console.log(`[AO Messages] Fetching for ${periods.length} periods`);

    const BATCH_SIZE = 5;
    const results = [];

    // Process periods in batches of 5
    for (let i = 0; i < periods.length; i += BATCH_SIZE) {
        const batch = periods.slice(i, i + BATCH_SIZE);

        // Process batch in parallel
        const batchResults = await Promise.all(batch.map(async (period) => {
            const date = period?.[dateKey] || period.endTime;
            const dateStr = date.toISOString().split('T')[0];
            const cacheKey = `ao-messages-${dateStr}`;

            // Check cache
            if (responseCache.has(cacheKey)) {
                const { data, timestamp } = responseCache.get(cacheKey);
                if (Date.now() - timestamp < 30 * 60 * 1000) {
                    console.log(`[AO Messages] Using cached data for ${dateStr}: ${data} messages`);
                    return { date: dateStr, count: data };
                }
            }

            const query = `query {
                transactions(
                    tags: [{ name: "Data-Protocol", values: ["ao"] }]
                    block: { min: ${period.startHeight}, max: ${period.endHeight} }
                ) {
                    count
                }
            }`;

            try {
                    const response = await fetch(ARWEAVE_GRAPHQL_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query })
                });

                if (response.ok) {
                    const result = await response.json();
                    const count = result.data.transactions.count;
                    console.log(`[AO Messages] ${dateStr}: ${count} messages`);
                    responseCache.set(cacheKey, { data: count, timestamp: Date.now() });
                    return { date: dateStr, count };
                } else {
                    console.warn(`[AO Messages] HTTP error ${response.status} for ${dateStr}`);
                    return { date: dateStr, count: 0 };
                }
            } catch (error) {
                console.error(`[AO Messages] Error fetching for ${dateStr}:`, error);
                return { date: dateStr, count: 0 };
            }
        }));

        results.push(...batchResults);

        // Small delay between batches
        if (i + BATCH_SIZE < periods.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    console.log(`[AO Messages] Total results:`, results.map(r => `${r.date}: ${r.count}`).join(', '));
    return results;
}

/**
 * Fetches total transaction counts per day
 */
async function fetchTotalTransactionCounts(periods, currentHeight, dateKey = 'endTime') {
    console.log(`[Total TX] Fetching for ${periods.length} periods`);

    const BATCH_SIZE = 5;
    const results = [];

    // Process periods in batches of 5
    for (let i = 0; i < periods.length; i += BATCH_SIZE) {
        const batch = periods.slice(i, i + BATCH_SIZE);

        // Process batch in parallel
        const batchResults = await Promise.all(batch.map(async (period) => {
            const date = period?.[dateKey] || period.endTime;
            const dateStr = date.toISOString().split('T')[0];
            const cacheKey = `total-tx-${dateStr}`;

            // Check cache
            if (responseCache.has(cacheKey)) {
                const { data, timestamp } = responseCache.get(cacheKey);
                if (Date.now() - timestamp < 30 * 60 * 1000) {
                    console.log(`[Total TX] Using cached data for ${dateStr}: ${data} transactions`);
                    return { date: dateStr, count: data };
                }
            }

            const query = `query {
                transactions(
                    block: { min: ${period.startHeight}, max: ${period.endHeight} }
                ) {
                    count
                }
            }`;

            try {
                const response = await fetch('https://arweave-search.goldsky.com/graphql', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query })
                });

                if (response.ok) {
                    const result = await response.json();
                    const count = result.data.transactions.count;
                    console.log(`[Total TX] ${dateStr}: ${count} transactions`);
                    responseCache.set(cacheKey, { data: count, timestamp: Date.now() });
                    return { date: dateStr, count };
                } else {
                    console.warn(`[Total TX] HTTP error ${response.status} for ${dateStr}`);
                    return { date: dateStr, count: 0 };
                }
            } catch (error) {
                console.error(`[Total TX] Error fetching for ${dateStr}:`, error);
                return { date: dateStr, count: 0 };
            }
        }));

        results.push(...batchResults);

        // Small delay between batches
        if (i + BATCH_SIZE < periods.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    console.log(`[Total TX] Total results:`, results.map(r => `${r.date}: ${r.count}`).join(', '));
    return results;
}

/**
 * Fetches transaction counts for a specific process type over multiple time periods
 * @param {string} processName - The name of the process
 * @param {Array} periods - Array of time periods with start/end heights
 * @returns {Promise<Array>} Array of transaction counts for each period
 */
export async function fetchVolumeData() {
    try {
        // Create a unique cache key for this request
        const cacheKey = `volume-stats`;
        
        // Check if we have cached data that's less than 30min old
        if (responseCache.has(cacheKey)) {
            const { data, timestamp } = responseCache.get(cacheKey);
            if (Date.now() - timestamp < 30 * 60 * 1000) {
                return data;
            }
        }

        const response = await fetch ('https://raw.githubusercontent.com/Jonny-Ringo/the_eye_of_AO/main/data/volume-stats.json');
        if (!response.ok) {
            throw new Error(`Network error: ${response.status} ${response.statusText}`);
        
        }
        // Cache the result
        const rawData = await response.json();

        const volumeData = rawData.volumeData;

        // Transform the data into the required format
        const processedData = {
            AO: volumeData.AO.map(entry => ({
                timestamp: new Date(entry.date).getTime(),
                value: entry.volume
            }))
            /* Disabled stablecoin volume placeholder:
            wUSDC: volumeData.wUSDC.map(entry => ({
                timestamp: new Date(entry.date).getTime(),
                value: entry.volume
            }))
            */
        };

        responseCache.set(cacheKey, {
            data: processedData,
            timestamp: Date.now()
        });
        console.log('Processed volume data:', processedData);
        return processedData;
    } catch (error) {
        console.error("Error fetching volume data:", error);
        throw error;
    }
}



/**
 * Fetches daily player stats for Stargrid Battle Tactics
 * @returns {Promise<Array>} Array of daily player count data
 */
export async function fetchStargridStats() {
    try {
        const cacheKey = 'stargrid-history';
        if (responseCache.has(cacheKey)) {
            const { data, timestamp } = responseCache.get(cacheKey);
            if (Date.now() - timestamp < 15 * 60 * 1000) {
                return data;
            }
        }

        const response = await dryrun({
            process: 'wTTkZPnORwkt8PMV7CpJ4KVHUV3cY8pWKJgHkUEGM4g',
            data: '',
            tags: [
                { name: "Action", value: "GetDailyStats" },
                { name: "Data-Protocol", value: "ao" },
                { name: "Type", value: "Message" },
                { name: "Variant", value: "ao.TN.1" }
            ],
        });

        const statsTag = response.Messages[0]?.Tags.find(t => t.name === "DailyStats");
        if (!statsTag) throw new Error("No DailyStats tag found");

        const raw = JSON.parse(statsTag.value);
        let data = Object.entries(raw).map(([ts, d]) => ({
            timestamp: new Date(Number(ts)).toISOString(),
            casual: d.MatchesPlayedPerType?.Casual,
            ranked: d.MatchesPlayedPerType?.Ranked,
            count: d.ActiveUsersCount
        }));

        const todayTag = response.Messages[0]?.Tags.find(t => t.name === "TodayStats");
        if (todayTag) {
            const todayData = JSON.parse(todayTag.value);
            data.push({
                timestamp: new Date(todayData.Date).toISOString(),
                casual: todayData.MatchesPlayedPerType?.Casual || 0,
                ranked: todayData.MatchesPlayedPerType?.Ranked || 0,
                count: todayData.ActiveUsersCount
            });
        }

        // Sort data
        data.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        responseCache.set(cacheKey, { data, timestamp: Date.now() });
        return data;
    } catch (err) {
        console.error("Error fetching stargrid history:", err);
        throw err;
    }
}


/**
 * Logs the total QGL queries made during page load
 */
export function logQglQueryCount() {
    console.log(`🔍 Total QGL queries made: ${qglQueryCounter}`);
}

// Make the function available globally for console access
if (typeof window !== 'undefined') {
    window.logQglQueryCount = logQglQueryCount;
}

/**
 * Clears the API response cache
 */
export function clearCache() {
    responseCache.clear();
}
