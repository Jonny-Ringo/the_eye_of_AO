import express from 'express';
import cors from 'cors';
import { fetch } from 'undici';
import { mainnetNodes } from './mainnet-node-list.js';

const app = express();
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept']
}));

// Authorization patterns
const GATEWAY_PATTERN = /^https:\/\/eye-of-ao\.[^\/]+/i;
const LOCAL_ALLOWLIST = [
  "localhost:8080",
  "localhost"
];

// Node monitoring cache
const nodeStatusCache = new Map();
let lastUpdateTime = null;

// Extract both HyperBEAM and CU URLs from your mainnet node list (only proxy nodes)
const NODES_TO_MONITOR = [];

mainnetNodes
  .forEach(node => {
    // Always add HB node
    NODES_TO_MONITOR.push(node.hb);
    
    // Add CU node if it exists and isn't "--"
    if (node.cu && node.cu !== "--") {
      NODES_TO_MONITOR.push(node.cu);
    }
  });

function isAuthorizedReferrer(header) {
  if (!header) return false;

  // Allow eye-of-ao.*
  if (GATEWAY_PATTERN.test(header)) return true;

  // DOMAIN routing
  if (header.includes("hyperbeam-uptime.xyz")) return true;

//----------- Local dev support------------------
  return LOCAL_ALLOWLIST.some(prefix => header.includes(prefix));
}


async function tryRequestWithin5s(targetUrl) {
  const start = Date.now();

  const attempt = fetch(targetUrl, {
    method: "GET",
    redirect: "follow"
  }).then(async (res) => {
    const status = res.status;
    const responseTime = Date.now() - start;
    const isOnline = status >= 200 && status < 400;

    return {
      online: isOnline,
      status,
      responseTime
    };
  }).catch((err) => {
    return {
      online: false,
      error: err.message,
      responseTime: Date.now() - start
    };
  });

  const timeout = new Promise(resolve => {
    setTimeout(() => {
      resolve({
        online: false,
        error: "Timeout after 5 seconds",
        responseTime: 5000
      });
    }, 5000);
  });

  return Promise.race([attempt, timeout]);
}

async function checkAllNodes() {
  console.log(`🔄 Starting parallel checks for ${NODES_TO_MONITOR.length} nodes at ${new Date().toISOString()}`);
  const startTime = Date.now();
  
  // Check all nodes in parallel
  const checkPromises = NODES_TO_MONITOR.map(async (nodeUrl) => {
    try {
      const result = await tryRequestWithin5s(nodeUrl);
      nodeStatusCache.set(nodeUrl, {
        ...result,
        lastChecked: Date.now(),
        url: nodeUrl
      });
      console.log(`✓ ${nodeUrl}: ${result.online ? 'online' : 'offline'} (${result.responseTime}ms)`);
      return { nodeUrl, success: true, result };
    } catch (error) {
      nodeStatusCache.set(nodeUrl, {
        online: false,
        error: error.message,
        responseTime: 5000,
        lastChecked: Date.now(),
        url: nodeUrl
      });
      console.log(`✗ ${nodeUrl}: error - ${error.message}`);
      return { nodeUrl, success: false, error: error.message };
    }
  });
  
  // Wait for all checks to complete
  await Promise.allSettled(checkPromises);
  
  const totalTime = Date.now() - startTime;
  lastUpdateTime = Date.now();
  console.log(`✅ All node checks completed in ${(totalTime/1000).toFixed(1)}s at ${new Date().toISOString()}`);
}

// Main endpoint - returns cached status for specific node
app.get('/', async (req, res) => {
  const referer = req.headers.referer || "";
  const origin = req.headers.origin || "";
  const authorized = isAuthorizedReferrer(referer) || isAuthorizedReferrer(origin);

  if (!authorized) {
    return res.status(403).json({
      online: false,
      error: "Unauthorized request origin"
    });
  }

  const target = req.query.url;
  if (!target || !/^http/.test(target)) {
    return res.status(400).json({
      online: false,
      error: "Invalid or missing URL"
    });
  }

  // Return cached result if available
  const cachedResult = nodeStatusCache.get(target);
  if (cachedResult) {
    return res.status(200).json({
      ...cachedResult,
      cached: true,
      lastChecked: new Date(cachedResult.lastChecked).toISOString()
    });
  }

  // If not in cache, return error (node not monitored)
  res.status(404).json({
    online: false,
    error: "Node not found in monitoring list",
    cached: false
  });
});

// Optional: Get all cached statuses
app.get('/status', (req, res) => {
  const referer = req.headers.referer || "";
  const origin = req.headers.origin || "";
  const authorized = isAuthorizedReferrer(referer) || isAuthorizedReferrer(origin);

  if (!authorized) {
    return res.status(403).json({ error: "Unauthorized request origin" });
  }

  const allStatuses = Array.from(nodeStatusCache.values());
  const onlineCount = allStatuses.filter(s => s.online).length;
  
  res.json({
    lastUpdate: lastUpdateTime ? new Date(lastUpdateTime).toISOString() : null,
    totalNodes: allStatuses.length,
    onlineNodes: onlineCount,
    offlineNodes: allStatuses.length - onlineCount,
    statuses: allStatuses
  });
});

// Start background monitoring
const hbCount = mainnetNodes.filter(node => node.proxy === true).length;
const cuCount = mainnetNodes.filter(node => node.proxy === true && node.cu && node.cu !== "--").length;
console.log(`📋 Monitoring ${NODES_TO_MONITOR.length} total endpoints: ${hbCount} HyperBEAM + ${cuCount} CU nodes`);
checkAllNodes(); // Initial check
setInterval(checkAllNodes, 2 * 60 * 1000); // Check every 5 minutes

app.listen(3000, () => {
  console.log('✅ Server running on http://localhost:3000');
  console.log('🔄 Background node monitoring active (5min intervals)');
});