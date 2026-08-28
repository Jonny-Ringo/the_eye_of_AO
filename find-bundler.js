#!/usr/bin/env node
'use strict';

// Finds distinct Bundler-App-Name tag values over a block range.
// Usage:
//   node find-bundler.js
//   node find-bundler.js --lookback-blocks 20160
//   node find-bundler.js --min-height 1500000 --max-height 1510000
//   node find-bundler.js --json

const DEFAULT_ENDPOINT = process.env.GRAPHQL_ENDPOINT || 'https://arweave-search.goldsky.com/graphql';
const DEFAULT_LOOKBACK_BLOCKS = 50000;

function parseArgs(argv) {
  const args = {
    endpoint: DEFAULT_ENDPOINT,
    lookbackBlocks: DEFAULT_LOOKBACK_BLOCKS,
    minHeight: null,
    maxHeight: null,
    bundleFormat: 'binary',
    bundleVersion: '2.0.0',
    json: false,
    debug: false
  };

  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    const next = argv[i + 1];

    if (key === '--endpoint' && next) {
      args.endpoint = next;
      i++;
      continue;
    }
    if ((key === '--lookback-blocks' || key === '--lookbackBlocks') && next) {
      args.lookbackBlocks = Number.parseInt(next, 10);
      i++;
      continue;
    }
    if ((key === '--min-height' || key === '--minHeight') && next) {
      args.minHeight = Number.parseInt(next, 10);
      i++;
      continue;
    }
    if ((key === '--max-height' || key === '--maxHeight') && next) {
      args.maxHeight = Number.parseInt(next, 10);
      i++;
      continue;
    }
    if ((key === '--bundle-format' || key === '--bundleFormat') && next) {
      args.bundleFormat = String(next);
      i++;
      continue;
    }
    if ((key === '--bundle-version' || key === '--bundleVersion') && next) {
      args.bundleVersion = String(next);
      i++;
      continue;
    }
    if (key === '--json') {
      args.json = true;
      continue;
    }
    if (key === '--debug') {
      args.debug = true;
      continue;
    }
    if (key === '--help' || key === '-h') {
      printHelp();
      process.exit(0);
    }

    console.warn(`[warn] Unknown arg: ${key}`);
  }

  if (!Number.isFinite(args.lookbackBlocks) || args.lookbackBlocks < 0) {
    throw new Error('--lookback-blocks must be a non-negative integer');
  }
  if (args.minHeight !== null && (!Number.isFinite(args.minHeight) || args.minHeight < 0)) {
    throw new Error('--min-height must be a non-negative integer');
  }
  if (args.maxHeight !== null && (!Number.isFinite(args.maxHeight) || args.maxHeight < 0)) {
    throw new Error('--max-height must be a non-negative integer');
  }
  return args;
}

function printHelp() {
  console.log(`find-bundler.js - list Bundler-App-Name tag values\n\n` +
    `Usage:\n` +
    `  node find-bundler.js [options]\n\n` +
    `Options:\n` +
    `  --endpoint <url>           GraphQL endpoint (default: ${DEFAULT_ENDPOINT})\n` +
    `  --lookback-blocks <n>      Scan last N blocks (default: ${DEFAULT_LOOKBACK_BLOCKS})\n` +
    `  --min-height <n>           Min block height (overrides lookback)\n` +
    `  --max-height <n>           Max block height (default: indexed tip)\n` +
    `  --bundle-format <value>    Bundle-Format tag value (default: binary)\n` +
    `  --bundle-version <value>   Bundle-Version tag value (default: 2.0.0)\n` +
    `  --json                     Emit JSON to stdout\n` +
    `  --debug                    Extra logs\n` +
    `  -h, --help                 Show help\n`
  );
}

async function queryGraphQL(endpoint, queryString, { timeoutMs = 20000, retries = 2, debug = false } = {}) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryString }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`GraphQL HTTP ${response.status}`);
      }

      const result = await response.json();
      if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
      }

      return result;
    } catch (error) {
      lastError = error;
      if (debug) {
        console.warn(`[debug] query attempt ${attempt + 1}/${retries + 1} failed: ${error?.message || error}`);
      }
      if (attempt < retries) {
        const backoffMs = 500 * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError;
}

async function getIndexedTipHeight(endpoint, opts) {
  const query = `
    query {
      transactions(first: 1, sort: HEIGHT_DESC) {
        edges {
          node { block { height } }
        }
      }
    }
  `;

  const result = await queryGraphQL(endpoint, query, opts);
  const height = result?.data?.transactions?.edges?.[0]?.node?.block?.height;
  if (typeof height !== 'number') {
    throw new Error('Unable to determine indexed tip height from GraphQL');
  }
  return height;
}

function buildBundleTxQuery(minHeight, maxHeight, cursor, bundleFormat, bundleVersion) {
  // Many GraphQL indexers require tag `values` for filtering, and do not support
  // "name-only" tag matching. Instead, filter for ANS-104 bundle txs via known tags,
  // then extract Bundler-App-Name from the returned tag set.
  const tagsFilter = `tags: [` +
    `{ name: \"Bundle-Format\", values: [\"${bundleFormat.replace(/\\"/g, '')}\"] },` +
    `{ name: \"Bundle-Version\", values: [\"${bundleVersion.replace(/\\"/g, '')}\"] }` +
  `]`;

  return `
    query {
      transactions(
        first: 100
        ${tagsFilter}
        block: { min: ${minHeight}, max: ${maxHeight} }
        sort: HEIGHT_ASC
        ${cursor ? `, after: \"${cursor}\"` : ''}
      ) {
        pageInfo { hasNextPage }
        edges {
          cursor
          node {
            id
            block { height timestamp }
            tags { name value }
          }
        }
      }
    }
  `;
}

function extractBundlerValues(tags) {
  if (!Array.isArray(tags)) return [];
  const values = [];
  for (const tag of tags) {
    if (tag?.name === 'Bundler-App-Name' && typeof tag?.value === 'string' && tag.value.length) {
      values.push(tag.value);
    }
  }
  return values;
}

async function main() {
  const args = parseArgs(process.argv);
  const opts = { timeoutMs: 20000, retries: 2, debug: args.debug };

  const indexedTip = await getIndexedTipHeight(args.endpoint, opts);
  const maxHeight = args.maxHeight ?? indexedTip;
  const minHeight = args.minHeight ?? Math.max(0, maxHeight - args.lookbackBlocks);

  if (minHeight > maxHeight) {
    throw new Error(`minHeight (${minHeight}) cannot be greater than maxHeight (${maxHeight})`);
  }

  if (!args.json) {
    console.log(`[scan] endpoint=${args.endpoint}`);
    console.log(`[scan] indexedTip=${indexedTip} range=${minHeight}..${maxHeight}`);
  }

  const counts = new Map(); // value -> count
  const examples = new Map(); // value -> [{txid,height}, ...]

  let cursor = null;
  let page = 0;
  let txSeen = 0;

  while (true) {
    const query = buildBundleTxQuery(minHeight, maxHeight, cursor, args.bundleFormat, args.bundleVersion);
    const result = await queryGraphQL(args.endpoint, query, opts);

    const edges = result?.data?.transactions?.edges || [];
    const hasNext = !!result?.data?.transactions?.pageInfo?.hasNextPage;

    if (edges.length === 0) {
      break;
    }

    for (const edge of edges) {
      const node = edge?.node;
      if (!node?.id) continue;
      txSeen++;

      const bundlers = extractBundlerValues(node.tags);
      for (const value of bundlers) {
        counts.set(value, (counts.get(value) || 0) + 1);

        if (!examples.has(value)) examples.set(value, []);
        const list = examples.get(value);
        if (list.length < 3) {
          list.push({ txid: node.id, height: node?.block?.height });
        }
      }
    }

    cursor = edges[edges.length - 1]?.cursor || cursor;
    page++;

    if (!args.json && (page % 25 === 0)) {
      console.log(`[scan] pages=${page} tx=${txSeen} uniqueBundlers=${counts.size}`);
    }

    if (!hasNext) break;
  }

  const sorted = Array.from(counts.entries())
    .map(([value, count]) => ({ value, count, examples: examples.get(value) || [] }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  if (args.json) {
    process.stdout.write(JSON.stringify({
      endpoint: args.endpoint,
      range: { minHeight, maxHeight, indexedTip },
      bundleFilter: { bundleFormat: args.bundleFormat, bundleVersion: args.bundleVersion },
      pagesFetched: page,
      transactionsScanned: txSeen,
      uniqueBundlers: sorted.length,
      bundlers: sorted
    }, null, 2) + '\n');
    return;
  }

  console.log(`\n[result] Scanned ${txSeen} tx in ${page} page(s)`);
  console.log(`[result] Found ${sorted.length} unique Bundler-App-Name value(s):`);

  for (const item of sorted) {
    const exampleText = item.examples
      .map((e) => `${String(e.txid).slice(0, 10)}…@${e.height}`)
      .join(', ');
    console.log(`- ${item.value}  (${item.count})${exampleText ? `  e.g. ${exampleText}` : ''}`);
  }
}

main().catch((error) => {
  console.error(`[fatal] ${error?.message || error}`);
  process.exitCode = 1;
});
