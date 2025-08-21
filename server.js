import express from 'express';
import cors from 'cors';
import { fetch } from 'undici';
import { mainnetNodes } from './mainnet-node-list.js';
import fs from 'fs';

const STATUS_FILE = '/root/hb/node-status.json';

const NODES_TO_MONITOR = [];
mainnetNodes.forEach(node => {
  NODES_TO_MONITOR.push(node.hb);
  if (node.cu && node.cu !== "--") {
    NODES_TO_MONITOR.push(node.cu);
  }
});

const GATEWAY_PATTERN = /^https:\/\/(dev-)?eye-of-ao\.[^\/]+/i;
const LOCAL_ALLOWLIST = ["localhost:8080", "localhost"];

function isAuthorizedReferrer(header) {
  if (!header) return false;
  if (GATEWAY_PATTERN.test(header)) return true;
  if (header.includes("hyperbeam-uptime.xyz")) return true;
  //----------- Local dev support------------------
  // return LOCAL_ALLOWLIST.some(prefix => header.includes(prefix));
}

async function tryRequestWithin5s(targetUrl) {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    const res = await fetch(targetUrl, { method: "GET", signal: controller.signal });
    clearTimeout(timeoutId);
    return { online: res.status >= 200 && res.status < 400, status: res.status, responseTime: Date.now() - start };
  } catch (err) {
    clearTimeout(timeoutId);
    return { online: false, error: err.name === 'AbortError' ? 'Timeout after 5 seconds' : err.message, responseTime: 5000 };
  }
}

async function checkAllNodes() {
  console.log(`🔄 Checking ${NODES_TO_MONITOR.length} nodes at ${new Date().toISOString()}`);
  const statuses = [];

  await Promise.allSettled(NODES_TO_MONITOR.map(async (url) => {
    const result = await tryRequestWithin5s(url);
    statuses.push({ url, ...result, lastChecked: Date.now() });
    console.log(`✓ ${url}: ${result.online ? 'online' : 'offline'} (${result.responseTime}ms)`);
  }));

  const data = { lastUpdate: new Date().toISOString(), statuses };
  fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2));
  console.log(`✅ Wrote results to ${STATUS_FILE}`);
}

function startServer() {
  const app = express();

  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'Accept']
  }));

  app.get('/', (req, res) => {
    const referer = req.headers.referer || "";
    const origin = req.headers.origin || "";
    const authorized = isAuthorizedReferrer(referer) || isAuthorizedReferrer(origin);

    const target = req.query.url;
    if (!authorized || !target || !/^http/.test(target)) {
      return res.status(403).json({ error: "Unauthorized or invalid request" });
    }

    try {
      const { statuses } = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8'));
      const match = statuses.find(s => s.url === target);
      if (match) return res.status(200).json({ ...match, cached: true });
      return res.status(404).json({ error: "Node not found", cached: false });
    } catch {
      return res.status(500).json({ error: "Failed to read node data" });
    }
  });

  app.get('/status', (req, res) => {
    const referer = req.headers.referer || "";
    const origin = req.headers.origin || "";
    const authorized = isAuthorizedReferrer(referer) || isAuthorizedReferrer(origin);
    if (!authorized) return res.status(403).json({ error: "Unauthorized request origin" });

    try {
      const raw = fs.readFileSync(STATUS_FILE, 'utf-8');
      res.setHeader('Content-Type', 'application/json');
      res.send(raw);
    } catch {
      res.status(500).json({ error: "Failed to read status file" });
    }
  });

  app.listen(3000, () => {
    console.log('✅ Status server running on http://localhost:3000');
  });
}

if (process.argv.includes('--serve')) {
  startServer();
} else {
  await checkAllNodes();
  process.exit(0);
}

