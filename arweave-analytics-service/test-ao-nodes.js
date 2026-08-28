import axios from 'axios';

const GRAPHQL_ENDPOINT = 'https://arweave-search.goldsky.com/graphql';

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

async function findAONodes() {
  const query = `query{
    transactions(
      tags: [
        { name: "data-protocol", values: ["ao"] }
        { name: "variant", values: ["ao.N.1"] }
        { name: "type", values: ["location"] }
      ]
      first: 100
    ) {
      edges {
        node {
          id
          owner {
            address
          }
          block {
            height
            timestamp
          }
          tags {
            name
            value
          }
        }
      }
    }
  }`;

  const result = await queryGraphQL(query);
  return result.data.transactions.edges;
}

function extractNodeUrl(tags) {
  const urlTag = tags.find(tag => tag.name === 'url');
  return urlTag ? urlTag.value : null;
}

function isTestNode(url) {
  if (!url) return true;

  const testUrls = [
    'http://localhost:0',
    'https://hyperbeam-test-ignore.com'
  ];

  return testUrls.some(testUrl => url.includes(testUrl));
}

async function pingNode(url) {
  try {
    console.log(`  Pinging ${url}...`);

    const response = await axios.get(url, {
      timeout: 10000, // 10 second timeout
      validateStatus: (status) => status === 200
    });

    return { status: 'online', statusCode: response.status };
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      return { status: 'offline', reason: 'timeout (>10s)' };
    } else if (error.response) {
      return { status: 'offline', reason: `HTTP ${error.response.status}` };
    } else {
      return { status: 'offline', reason: error.code || error.message };
    }
  }
}

(async () => {
  console.log('========================================');
  console.log('AO NODE STATUS TEST');
  console.log('========================================\n');

  try {
    console.log('[Step 1] Querying AO node location transactions...');
    const edges = await findAONodes();
    console.log(`Found ${edges.length} node location transactions\n`);

    console.log('[Step 2] Filtering out test nodes...');

    const nodes = [];
    for (const edge of edges) {
      const node = edge.node;
      const url = extractNodeUrl(node.tags);

      if (isTestNode(url)) {
        console.log(`  Skipping test node: ${url || 'null'}`);
        continue;
      }

      nodes.push({
        txId: node.id,
        owner: node.owner.address,
        url: url,
        height: node.block.height,
        timestamp: new Date(node.block.timestamp * 1000).toISOString()
      });
    }

    console.log(`\nFiltered to ${nodes.length} real nodes\n`);

    if (nodes.length === 0) {
      console.log('No real nodes found.');
      process.exit(0);
    }

    console.log('[Step 3] Pinging each node (10s timeout)...');
    console.log('========================================\n');

    const results = [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      console.log(`[${i + 1}/${nodes.length}] ${node.url}`);
      console.log(`  TxID: ${node.txId}`);
      console.log(`  Owner: ${node.owner}`);
      console.log(`  Height: ${node.height}`);
      console.log(`  Timestamp: ${node.timestamp}`);

      const pingResult = await pingNode(node.url);

      results.push({
        url: node.url,
        txId: node.txId,
        owner: node.owner,
        status: pingResult.status,
        statusCode: pingResult.statusCode,
        reason: pingResult.reason
      });

      if (pingResult.status === 'online') {
        console.log(`  ✓ ONLINE (HTTP ${pingResult.statusCode})`);
      } else {
        console.log(`  ✗ OFFLINE (${pingResult.reason})`);
      }

      console.log('');
    }

    console.log('\n========================================');
    console.log('SUMMARY');
    console.log('========================================\n');

    const online = results.filter(r => r.status === 'online');
    const offline = results.filter(r => r.status === 'offline');

    console.log(`Total Nodes: ${results.length}`);
    console.log(`Online: ${online.length}`);
    console.log(`Offline: ${offline.length}`);
    console.log('');

    if (online.length > 0) {
      console.log('ONLINE NODES:');
      online.forEach(node => {
        console.log(`  ✓ ${node.url} (HTTP ${node.statusCode})`);
      });
      console.log('');
    }

    if (offline.length > 0) {
      console.log('OFFLINE NODES:');
      offline.forEach(node => {
        console.log(`  ✗ ${node.url} - ${node.reason}`);
      });
      console.log('');
    }

    console.log('========================================');
    console.log('TEST COMPLETE');
    console.log('========================================');

  } catch (error) {
    console.error('\n[FATAL ERROR]', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
