// mainnet-nodes.js - HyperBEAM mainnet node checking functionality
import { mainnetNodes } from './mainnet-node-list.js';
import { updateSummary } from './hyperbeam-uptime.js';
import { USE_SERVER_NODES_LIST } from '../config.js';
import { fetchNodesList } from '../api.js';

const proxyURL = "https://hyperbeam-uptime.xyz/?url=";

/**
 * Gets the current node list from server or fallback to bundled
 * @returns {Promise<Array>} Array of node objects
 */
async function getNodesList() {
    if (USE_SERVER_NODES_LIST) {
        try {
            return await fetchNodesList();
        } catch (error) {
            console.warn('Failed to fetch nodes from server, using bundled list:', error);
            return mainnetNodes;
        }
    }
    return mainnetNodes;
}

// Note: Status data is now included in the node list response from getNodesList()
// No need for separate status fetching or URL normalization

// Quick renderer for HB (top row) using a status object
function applyHBFromStatus(nodeCard, statusObj, busyMs) {
  const statusIndicator = nodeCard.querySelector('.status-indicator');
  const statusText = nodeCard.querySelector('.status span:last-child');
  const responseTimeEl = nodeCard.querySelector('.response-time');

  if (!statusObj) {
    statusIndicator.className = 'status-indicator unavailable';
    statusText.textContent = 'Unavailable';
    responseTimeEl.textContent = 'Unknown';
    return false;
  }

  const isOnline = !!statusObj.online;
  if (!isOnline) {
    statusIndicator.className = 'status-indicator unavailable';
    statusText.textContent = 'Unavailable';
    responseTimeEl.textContent = 'Offline';
    return false;
  }

  const rt = Number(statusObj.responseTime ?? 0);
  const isBusy = rt > busyMs;
  statusIndicator.className = `status-indicator ${isBusy ? 'busy' : 'online'}`;
  statusText.textContent = isBusy ? 'Busy' : 'Online';
  responseTimeEl.textContent = `Response time: ${rt || '—'}ms`;
  return true;
}

// Quick renderer for CU (bottom row) using a status object
function applyCUFromStatus(nodeCard, statusObj) {
  const statusIndicator = nodeCard.querySelector('.cu-status-container .status-indicator');
  const statusText = nodeCard.querySelector('.cu-status-container .status span:last-child');
  const responseTimeEl = nodeCard.querySelector('.cu-status-container .response-time');

  if (!statusObj) {
    statusIndicator.className = 'status-indicator unavailable';
    statusText.textContent = 'CU Unavailable';
    responseTimeEl.textContent = 'Unknown';
    return false;
  }

  const isOnline = !!statusObj.online;
  if (!isOnline) {
    statusIndicator.className = 'status-indicator unavailable';
    statusText.textContent = 'CU Unavailable';
    responseTimeEl.textContent = 'Offline';
    return false;
  }

  const rt = Number(statusObj.responseTime ?? 0);
  statusIndicator.className = 'status-indicator online';
  statusText.textContent = 'Online';
  responseTimeEl.textContent = `Response time: ${rt || '—'}ms`;
  return true;
}


// Configuration
const config = {
    checkTimeout: 10000, // Timeout for each check (ms)
    busyTimeout: 2000,   // Time to mark as busy (ms)
    autoRefreshInterval: 300000   // Auto-refresh every 5 minutes
};

// State
let autoRefreshTimer;
let mainnetNodesTotal = 0;
let mainnetNodesOnline = 0;
let cuNodesTotal = 0;
let cuNodesOnline = 0;

// Initialize mainnet nodes dashboard
function initializeMainnetNodes() {
    // Initial check
    checkAllMainnetNodes();
    
    // Set up auto-refresh
    startAutoRefresh();
}

function startAutoRefresh() {
    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(() => checkAllMainnetNodes(), config.autoRefreshInterval);
}



function updateLastCheckedTime() {
    const mainnetLastUpdatedEl = document.getElementById('mainnetLastUpdated');
    
    const now = new Date();
    const timeString = `Last updated: ${now.toLocaleTimeString()}`;
    
    // Update mainnet timestamp
    if (mainnetLastUpdatedEl) {
        mainnetLastUpdatedEl.textContent = timeString;
    }
    
}

async function checkAllMainnetNodes() {
  const mainnetStatusContainer = document.getElementById('mainnetStatusContainer');
  console.log("Starting mainnet node check...");

  // Clear the container
  mainnetStatusContainer.innerHTML = '';

  // Update last checked time
  updateLastCheckedTime();

  // Get enriched node list (already includes status from server!)
  const nodesList = await getNodesList();

  // Totals
  mainnetNodesTotal = nodesList.length;
  mainnetNodesOnline = 0;
  cuNodesTotal = nodesList.filter(node => node.cu && node.cu !== "--").length;
  cuNodesOnline = 0;

  console.log(`Checking ${nodesList.length} mainnet nodes with ${cuNodesTotal} CU nodes...`);

  // Build all cards using the enriched node data (already has status!)
  nodesList.forEach((node) => {
    // Create status objects from the enriched node data
    const hbStatusObj = {
      online: node.hbOnline,
      status: node.hbStatus,
      responseTime: node.hbResponseTime,
      lastChecked: node.hbLastChecked,
      error: node.hbError
    };

    const cuStatusObj = node.cu && node.cu !== "--" ? {
      online: node.cuOnline,
      status: node.cuStatus,
      responseTime: node.cuResponseTime,
      lastChecked: node.cuLastChecked,
      error: node.cuError
    } : null;

    checkMainnetNodePair(
      null, // not used
      null, // not used
      node.hb,
      node.cu,
      mainnetStatusContainer,
      (hbOnline, cuOnline) => {
        if (hbOnline) mainnetNodesOnline++;
        if (node.cu !== "--" && cuOnline) cuNodesOnline++;
        updateSummary();
      },
      hbStatusObj,
      cuStatusObj
    );
  });

  // Sort cards after rendering
  setTimeout(() => sortNodeCards(mainnetStatusContainer), 100);
}


function checkMainnetNodePair(_hbNodeUrl, _cuNodeUrl, hbDisplayName, cuDisplayName, container, callback, hbStatusObj, cuStatusObj) {
  // Create a card for this node pair
  const nodeId = `mainnet-${hbDisplayName.replace(/https?:\/\//, '').replace(/\./g, '-').replace(/\//g, '')}`;
  const hbNodeName = hbDisplayName.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const cuNodeName = cuDisplayName && cuDisplayName !== "--"
    ? cuDisplayName.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : "--";

  const nodeCard = document.createElement('div');
  nodeCard.id = nodeId;
  nodeCard.className = 'node-card';
  container.appendChild(nodeCard);

  nodeCard.innerHTML = `
    <div class="node-name">${hbNodeName}</div>
    <div class="status">
      <span class="status-indicator loading"></span>
      <span>Loading...</span>
    </div>
    <div class="response-time">-</div>
    <div class="cu-status-container">
      <div class="cu-label">CU: ${cuNodeName}</div>
      <div class="status">
        <span class="status-indicator ${cuDisplayName === "--" ? "unavailable" : "loading"}"></span>
        <span>${cuDisplayName === "--" ? "Not Available" : "Loading..."}</span>
      </div>
      <div class="response-time">${cuDisplayName === "--" ? "-" : "-"}</div>
    </div>
    <div class="node-actions">
      <a href="${unwrapProxiedUrl(hbDisplayName)}" target="_blank" title="Visit HyperBEAM Node">
        <i class="fas fa-external-link-alt"></i>
      </a>
      <a href="${unwrapProxiedUrl(hbDisplayName)}~meta@1.0/info" target="_blank" title="View HyperBEAM Metadata">
        <i class="fas fa-info-circle"></i>
      </a>
      ${cuDisplayName !== "--" ? `
      <a href="${unwrapProxiedUrl(cuDisplayName)}" target="_blank" title="Visit CU Node">
        <i class="fas fa-server"></i>
      </a>` : ''}
    </div>
  `;

  // Render from the aggregated statuses (no network calls)
  const hbOnline = applyHBFromStatus(nodeCard, hbStatusObj, config.busyTimeout);
  let cuOnline = false;

  if (cuDisplayName !== "--") {
    cuOnline = applyCUFromStatus(nodeCard, cuStatusObj);
  } else {
    // mark as not available (already set in HTML)
  }

  if (callback) callback(hbOnline, cuOnline);
}


function unwrapProxiedUrl(url) {
    if (url.includes(proxyURL)) {
        return decodeURIComponent(url.split("url=")[1]);
    }
    return url;
}



// Function to check HyperBEAM nodes
function checkHyperBeamNodeStatus(nodeUrl, nodeCard, callback) {
    const busyTimeout = config.busyTimeout;
    const offlineTimeout = config.checkTimeout;
    const startTime = performance.now();
    const controller = new AbortController();

    const statusIndicator = nodeCard.querySelector('.status-indicator');
    const statusText = nodeCard.querySelector('.status span:last-child');
    const responseTimeEl = nodeCard.querySelector('.response-time');

    const busyTimeoutId = setTimeout(() => {
        statusIndicator.className = 'status-indicator busy';
        statusText.textContent = 'Busy';
        responseTimeEl.textContent = 'Slow response...';
    }, busyTimeout);

    const offlineTimeoutId = setTimeout(() => {
        controller.abort();
        statusIndicator.className = 'status-indicator unavailable';
        statusText.textContent = 'Unavailable';
        responseTimeEl.textContent = 'Timeout';
        if (callback) callback(false);
    }, offlineTimeout);

    fetch(nodeUrl, {
        method: 'GET',
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit'
    })
    .then(res => res.json())
    .then(data => {
        clearTimeout(busyTimeoutId);
        clearTimeout(offlineTimeoutId);
        const endTime = performance.now();
        const responseTime = (endTime - startTime).toFixed(0);

        const isOnline = data.online === true;
        const serverResponseTime = data.responseTime || responseTime;
        const status = parseInt(serverResponseTime) > busyTimeout ? 'busy' : 'online';

        if (isOnline) {
            statusIndicator.className = `status-indicator ${status}`;
            statusText.textContent = status === 'online' ? 'Online' : 'Busy';
            responseTimeEl.textContent = `Response time: ${serverResponseTime}ms`;
            if (callback) callback(true);
        } else {
            statusIndicator.className = 'status-indicator unavailable';
            statusText.textContent = 'Unavailable';
            responseTimeEl.textContent = 'Offline';
            if (callback) callback(false);
        }
    })
    .catch(error => {
        clearTimeout(busyTimeoutId);
        clearTimeout(offlineTimeoutId);
        console.error(`❌ Error checking HB node ${nodeUrl}:`, error.message);
        statusIndicator.className = 'status-indicator unavailable';
        statusText.textContent = 'Unavailable';
        responseTimeEl.textContent = 'Error';
        if (callback) callback(false);
    });
}


function checkCuNodeStatus(nodeUrl, nodeCard, callback) {
    checkCuViaWorker(nodeUrl, nodeCard, callback);
}

function checkCuViaWorker(nodeUrl, nodeCard, callback) {
    const startTime = performance.now();
    const controller = new AbortController();

    fetch(nodeUrl, {
        method: 'GET',
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit'
    })
    .then(async res => {
        const endTime = performance.now();
        const responseTime = (endTime - startTime).toFixed(0);

        let data;
        try {
            data = await res.json();
        } catch {
            console.warn(`⚠️ CU Proxy JSON invalid for ${nodeUrl}`);
            return markCuOffline();
        }

        // Handle cached response format from your server
        if (data.cached) {
            // Use server's cached result
            const isOnline = data.online === true;
            const serverResponseTime = data.responseTime || 'Unknown';
            updateCuDisplay(isOnline, serverResponseTime, nodeCard, callback);
        } else {
            // Fallback to old format (shouldn't happen with new server)
            console.warn(`⚠️ CU Proxy response not cached for ${nodeUrl}`);
        }
    })
    .catch(err => {
        console.error(`[CU Proxy ERROR] ${nodeUrl}`, err.message);
        updateCuDisplay(false, 'Error', nodeCard, callback);
    });

    function markCuOffline() {
        updateCuDisplay(false, 'Offline', nodeCard, callback);
    }
}

/*
function checkCuDirectHttps(nodeUrl, nodeCard, callback) {
    const startTime = performance.now();
    const controller = new AbortController();

    // Try normal fetch first to get real status codes
    fetch(nodeUrl, {
        method: 'HEAD',
        signal: controller.signal,
        credentials: 'omit'
        // No mode specified = normal fetch
    })
    .then(response => {
        const endTime = performance.now();
        const responseTime = (endTime - startTime).toFixed(0);
        
        // Now we can read actual status codes!
        const isOnline = response.status >= 200 && response.status < 400;
        updateCuDisplay(isOnline, responseTime, nodeCard, callback);
    })
    .catch(err => {
        const endTime = performance.now();
        const responseTime = (endTime - startTime).toFixed(0);

        // Check if it's just a CORS issue (server is up but blocking)
        if (err.message.includes('CORS') || err.message.includes('NetworkError')) {
            console.log(`⚠️ CORS blocked ${nodeUrl}, assuming online`);
            updateCuDisplay(true, responseTime, nodeCard, callback);
        } else {
            console.log(`✗ Failed ${nodeUrl}: ${err.message}`);
            updateCuDisplay(false, responseTime, nodeCard, callback);
        }
    });
}
*/

function updateCuDisplay(isOnline, responseTime, nodeCard, callback) {
    const statusIndicator = nodeCard.querySelector('.cu-status-container .status-indicator');
    const statusText = nodeCard.querySelector('.cu-status-container .status span:last-child');
    const responseTimeEl = nodeCard.querySelector('.cu-status-container .response-time');

    if (isOnline) {
        statusIndicator.className = 'status-indicator online';
        statusText.textContent = 'Online';
        responseTimeEl.textContent = `Response time: ${responseTime}ms`;
        if (callback) callback(true);
    } else {
        statusIndicator.className = 'status-indicator unavailable';
        statusText.textContent = 'CU Unavailable';
        responseTimeEl.textContent = responseTime;
        if (callback) callback(false);
    }
}

function sortNodeCards(container) {
    const cards = Array.from(container.children);
    
    cards.sort((a, b) => {
        // Get status from the cards
        const getStatus = (card) => {
            const statusEl = card.querySelector('.status-indicator');
            if (statusEl.classList.contains('online')) return 1;
            if (statusEl.classList.contains('busy')) return 2;
            if (statusEl.classList.contains('unavailable')) return 3;
            return 4; // loading/unknown
        };
        
        // Get protocol (HTTPS=1, HTTP=2)
        const getProtocol = (card) => {
            const nodeName = card.querySelector('.node-name').textContent;
            // Check if it's an IP or contains port (usually HTTP)
            return /\d+\.\d+\.\d+\.\d+|:\d+/.test(nodeName) ? 2 : 1;
        };
        
        const statusA = getStatus(a);
        const statusB = getStatus(b);
        
        // Primary sort: status (online first)
        if (statusA !== statusB) {
            return statusA - statusB;
        }
        
        // Secondary sort: protocol (HTTPS first)
        return getProtocol(a) - getProtocol(b);
    });
    
    // Re-append in sorted order
    cards.forEach(card => container.appendChild(card));
}



function getMainnetNodesTotal() {
    return mainnetNodesTotal;
}

function getMainnetNodesOnline() {
    return mainnetNodesOnline;
}

function getCuNodesTotal() {
    return cuNodesTotal;
}

function getCuNodesOnline() {
    return cuNodesOnline;
}

// Export functions
export {
    initializeMainnetNodes,
    checkAllMainnetNodes,
    getMainnetNodesTotal,
    getMainnetNodesOnline,
    getCuNodesTotal,
    getCuNodesOnline,
    checkCuNodeStatus,
    checkHyperBeamNodeStatus,
    unwrapProxiedUrl
};