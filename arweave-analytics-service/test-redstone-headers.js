import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const ARWEAVE_GATEWAY = process.env.ARWEAVE_GATEWAY || 'https://arweave.net/raw';
const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT || 'https://arweave-search.goldsky.com/graphql';

async function queryGraphQL(queryString) {
  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: queryString })
  });

  if (!response.ok) {
    throw new Error(`GraphQL HTTP ${response.status}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(JSON.stringify(result.errors));
  }

  return result;
}

async function getCurrentIndexedBlockHeight() {
  const query = `
    query {
      transactions(first: 1, sort: HEIGHT_DESC) {
        edges {
          node { block { height } }
        }
      }
    }
  `;

  const result = await queryGraphQL(query);
  const height = result?.data?.transactions?.edges?.[0]?.node?.block?.height;
  if (typeof height !== 'number') {
    throw new Error('Unable to determine indexed block height from GraphQL');
  }
  return height;
}

async function findRedstoneBundles(minHeight, maxHeight, limit = 5) {
  const query = `
    query {
      transactions(
        first: ${limit}
        tags: [{ name: "Bundler-App-Name", values: ["Redstone"] }]
        block: { min: ${minHeight}, max: ${maxHeight} }
        sort: HEIGHT_DESC
      ) {
        edges {
          node {
            id
            block { height timestamp }
          }
        }
      }
    }
  `;

  const result = await queryGraphQL(query);
  return result.data.transactions.edges.map(e => ({
    txid: e.node.id,
    height: e.node.block.height,
    timestamp: e.node.block.timestamp * 1000
  }));
}

async function fetchBundleHeader(txid) {
  console.log(`\n[Fetching] ${txid}`);
  console.log(`[Gateway] ${ARWEAVE_GATEWAY}`);
  console.log(`[URL] ${ARWEAVE_GATEWAY}/${txid}`);

  try {
    const response = await axios.get(`${ARWEAVE_GATEWAY}/${txid}`, {
      headers: { 'Range': 'bytes=0-31' },
      responseType: 'arraybuffer',
      timeout: 10000
    });

    const buffer = Buffer.from(response.data);

    console.log(`[Response] Status: ${response.status}`);
    console.log(`[Response] Content-Length: ${response.headers['content-length']}`);
    console.log(`[Response] Content-Range: ${response.headers['content-range']}`);
    console.log(`[Buffer] Length: ${buffer.length} bytes`);
    console.log(`[Buffer] Hex: ${buffer.toString('hex')}`);

    if (buffer.length < 32) {
      console.log(`[WARNING] Buffer too short: ${buffer.length} bytes (expected 32)`);
      return null;
    }

    // Parse ANS-104 header: First 8 bytes = number of data items (little-endian)
    const itemCount64LE = buffer.readBigUInt64LE(0);
    const itemCount32LE = buffer.readUInt32LE(0);
    const itemCount32BE = buffer.readUInt32BE(0);

    console.log(`[Parse] 64-bit Little Endian: ${itemCount64LE.toString()}`);
    console.log(`[Parse] 32-bit Little Endian: ${itemCount32LE}`);
    console.log(`[Parse] 32-bit Big Endian: ${itemCount32BE}`);
    console.log(`[Result] Item Count: ${Number(itemCount64LE)}`);

    return Number(itemCount64LE);
  } catch (error) {
    console.log(`[ERROR] ${error.message}`);
    if (error.response) {
      console.log(`[ERROR] Status: ${error.response.status}`);
      console.log(`[ERROR] Headers:`, error.response.headers);
    }
    if (error.code) {
      console.log(`[ERROR] Code: ${error.code}`);
    }
    return null;
  }
}

(async () => {
  console.log('========================================');
  console.log('REDSTONE BUNDLE HEADER TEST');
  console.log('========================================');
  console.log(`Gateway: ${ARWEAVE_GATEWAY}`);
  console.log(`GraphQL: ${GRAPHQL_ENDPOINT}`);
  console.log('========================================\n');

  try {
    console.log('[Step 1] Getting current indexed block height...');
    const currentHeight = await getCurrentIndexedBlockHeight();
    console.log(`Current indexed height: ${currentHeight}\n`);

    console.log('[Step 2] Finding recent Redstone bundles...');
    const minHeight = currentHeight - 5000; // Last ~5000 blocks
    const maxHeight = currentHeight;
    console.log(`Searching blocks ${minHeight} to ${maxHeight}\n`);

    const bundles = await findRedstoneBundles(minHeight, maxHeight, 5);
    console.log(`Found ${bundles.length} Redstone bundles`);

    // Debug: Show the GraphQL response
    if (bundles.length === 0) {
      console.log('\nDEBUG: Let me try a broader search...');
      const testQuery = `
        query {
          transactions(
            first: 5
            tags: [{ name: "Bundler-App-Name", values: ["Redstone"] }]
            sort: HEIGHT_DESC
          ) {
            edges {
              node {
                id
                block { height timestamp }
              }
            }
          }
        }
      `;
      const testResult = await queryGraphQL(testQuery);
      const testBundles = testResult.data.transactions.edges;
      console.log(`Found ${testBundles.length} Redstone bundles (no height filter)`);

      if (testBundles.length > 0) {
        console.log('\nMost recent Redstone bundles:');
        testBundles.forEach(e => {
          console.log(`  - ${e.node.id} at height ${e.node.block.height}`);
        });

        // Use these instead
        bundles.push(...testBundles.map(e => ({
          txid: e.node.id,
          height: e.node.block.height,
          timestamp: e.node.block.timestamp * 1000
        })));
      }
    }
    console.log();

    if (bundles.length === 0) {
      console.log('No Redstone bundles found in this range.');
      process.exit(0);
    }

    console.log('[Step 3] Fetching headers for each bundle...');
    console.log('========================================');

    for (const bundle of bundles) {
      const date = new Date(bundle.timestamp).toISOString();
      console.log(`\n--- Bundle ${bundles.indexOf(bundle) + 1}/${bundles.length} ---`);
      console.log(`TxID: ${bundle.txid}`);
      console.log(`Height: ${bundle.height}`);
      console.log(`Timestamp: ${date}`);

      const itemCount = await fetchBundleHeader(bundle.txid);

      if (itemCount !== null) {
        console.log(`✓ Successfully parsed: ${itemCount} items`);
      } else {
        console.log(`✗ Failed to parse`);
      }

      console.log('----------------------------------------');
    }

    console.log('\n========================================');
    console.log('TEST COMPLETE');
    console.log('========================================');

  } catch (error) {
    console.error('\n[FATAL ERROR]', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
