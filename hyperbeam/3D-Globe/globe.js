import {
  fitHostnameToElement,
  getCachedHyperbeamNodeCache,
  HYPERBEAM_NODE_CACHE_KEY,
  HYPERBEAM_ROSTER_EVENT
} from '../node-discovery.js';

const WORKING_SET_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Globe application using globe.gl
class HyperBEAMGlobe {
  constructor() {
    this.globe = null;
    this.nodeData = [];
    this.showLabels = true;
    this.showClouds = false;
    this.autoRotate = true;
    this.refreshTimer = null;

    // busy threshold same as dashboard logic
    this.busyMs = 2000;

    this.init();
  }

  init() {
    this.loadNodeData();
    this.createGlobe();
    this.hideLoading();

    this.cacheUpdateHandler = () => this.refreshFromNodeCache();
    this.storageHandler = event => {
      if (event.key === HYPERBEAM_NODE_CACHE_KEY) this.refreshFromNodeCache();
    };
    window.addEventListener(HYPERBEAM_ROSTER_EVENT, this.cacheUpdateHandler);
    window.addEventListener('storage', this.storageHandler);
  }

  extractHostname(url) {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `http://${url}`);
      return urlObj.hostname;
    } catch (error) {
      const match = url.match(/^(?:https?:\/\/)?([^\/:\s]+)/);
      return match ? match[1] : url;
    }
  }

  formatLastSeen(timestamp) {
    return timestamp ? new Date(timestamp).toLocaleString() : 'No successful response retained';
  }

  applyRoster(roster) {
    const oldestAccepted = Date.now() - WORKING_SET_MAX_AGE_MS;
    const nodesWithStatus = roster.peers
      .filter(node => {
        const lastWorking = Number(node.lastSeen || (node.probe?.online ? node.probe.checkedAt : 0));
        return node.probeability?.ok && lastWorking >= oldestAccepted;
      })
      .map(node => {
        const fallback = this.getFallbackCoordinates(node.url);
        const responseTime = node.probe?.responseTime;
        const status = node.probe?.online
          ? (responseTime > this.busyMs ? 'busy' : 'online')
          : 'offline';
        const geo = node.geo?.ok ? node.geo : null;

        return {
          url: this.extractHostname(node.url),
          lat: geo?.lat ?? fallback.lat,
          lng: geo?.lng ?? fallback.lng,
          status,
          location: geo?.location || 'Location lookup pending',
          country: geo?.country || 'Unknown',
          ip: geo?.ip || null,
          fullUrl: node.url,
          proxy: false,
          responseTime,
          lastSeen: Number(node.lastSeen || node.probe?.checkedAt) || 0
        };
      });

    this.nodeData = this.clusterNodesByLocation(nodesWithStatus);
    this.updateStats();
  }

  refreshGlobeData() {
    if (!this.globe) return;
    this.globe.pointsData(this.nodeData);
    this.globe.ringsData(this.nodeData);
  }

  loadNodeData() {
    const roster = getCachedHyperbeamNodeCache();
    if (!roster.peers.length) {
      this.nodeData = [];
      this.updateStats();
      return false;
    }
    this.applyRoster(roster);
    return this.nodeData.length > 0;
  }

  refreshFromNodeCache() {
    const loaded = this.loadNodeData();
    this.refreshGlobeData();
    if (loaded) document.getElementById('loading')?.remove();
  }

  getFallbackCoordinates(url) {
    let first = 2166136261;
    let second = 5381;
    for (const character of url) {
      first = Math.imul(first ^ character.charCodeAt(0), 16777619);
      second = Math.imul(second, 33) ^ character.charCodeAt(0);
    }
    return {
      lat: ((first >>> 0) % 12000) / 100 - 60,
      lng: ((second >>> 0) % 36000) / 100 - 180
    };
  }


  // Cluster nodes by location (kept your behavior; comment said 4+ but code used >=2)
  clusterNodesByLocation(nodes) {
    const clusters = new Map();

    // First pass: group nodes by rounded lat/lng
    nodes.forEach(node => {
      const key = `${node.lat.toFixed(2)}_${node.lng.toFixed(2)}`;

      if (!clusters.has(key)) {
        clusters.set(key, {
          lat: node.lat,
          lng: node.lng,
          location: node.location,
          nodes: [],
          statuses: { online: 0, busy: 0, offline: 0 }
        });
      }

      const cluster = clusters.get(key);
      cluster.nodes.push(node);
      cluster.statuses[node.status]++;
    });

    // Second pass: if 2+ nodes at same spot, cluster; otherwise gently offset
    const result = [];

    clusters.forEach(cluster => {
      const total = cluster.nodes.length;

      if (total >= 2) {
        const { online, busy, offline } = cluster.statuses;
        let primaryStatus = 'offline';
        if (online > 0) primaryStatus = 'online';
        if (busy > offline && busy > online) primaryStatus = 'busy';

        result.push({
          ...cluster.nodes[0], // base template
          status: primaryStatus,
          isCluster: true,
          clusterSize: total,
          clusterStats: cluster.statuses,
          allNodes: cluster.nodes,
          url: `${total} nodes in ${cluster.location}`
        });
      } else {
        // Offset singletons slightly to avoid exact overlap with near neighbors
        cluster.nodes.forEach(node => {
          result.push({
            ...node,
            lat: node.lat + (Math.random() - 0.5) * 0.05,
            lng: node.lng + (Math.random() - 0.5) * 0.05,
            isCluster: false
          });
        });
      }
    });

    return result;
  }

  createGlobe() {
    try {
      this.globe = Globe(document.getElementById('globe-container'), {
        rendererConfig: {
          antialias: false,
          alpha: false,
          powerPreference: "default",
          preserveDrawingBuffer: false
        }
      })
        .globeImageUrl('//unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
        .bumpImageUrl(null)
        .backgroundImageUrl('//unpkg.com/three-globe/example/img/night-sky.png')

        // Points configuration
        .pointsData(this.nodeData)
        .pointColor(d => {
          const baseColor = this.getStatusColor(d.status);
          // Convert hex to rgba with transparency
          const hex = baseColor.replace('#', '');
          const r = parseInt(hex.substr(0, 2), 16);
          const g = parseInt(hex.substr(2, 2), 16);
          const b = parseInt(hex.substr(4, 2), 16);
          return `rgba(${r}, ${g}, ${b}, 0.7)`; // 70% opacity
        })
        .pointAltitude(d => {
          if (d.isCluster) return 0.02;   // clusters closer to globe
          return 0.05;                     // individual nodes float higher
        })
        .pointRadius(d => {
          if (d.isCluster) return 0.2 + (d.clusterSize * 0.015);
          return 0.1;
        })
        .pointResolution(10)
        .pointLabel('')
        .onPointClick(null)
        .onPointHover((node, prevNode) => {
          // Clear any existing timeout
          if (this.hoverTimeout) {
            clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
          }

          // When hovering over a node
          if (node && !prevNode) {
            this.wasAutoRotating = this.autoRotate;
            if (this.wasAutoRotating && this.globe && this.globe.controls()) {
              this.globe.controls().autoRotate = false;
            }
            this.showCustomTooltip(node);
          }
          // When leaving a node hover - check tooltip hover before hiding
          else if (!node && prevNode) {
            this.hoverTimeout = setTimeout(() => {
              // Only hide if not hovering over tooltip
              const tooltip = document.getElementById('custom-globe-tooltip');
              if (!tooltip || !tooltip.matches(':hover')) {
                this.hideCustomTooltip();
                // Only restore auto-rotate if it was previously on
                if (this.wasAutoRotating && this.globe && this.globe.controls()) {
                  this.globe.controls().autoRotate = true;
                }
              }
            }, 100);
          }
        })

        // Static ring outline around points for clarity
        .ringsData(this.nodeData)
        .ringColor(d => this.getStatusColor(d.status))
        .ringMaxRadius(d => {
          const base = d.isCluster ? (0.2 + (d.clusterSize * 0.015)) : 0.1;
          return base * 1.2;
        })
        .ringRepeatPeriod(0)
        .ringPropagationSpeed(0)

        // Globe settings
        .width(window.innerWidth)
        .height(window.innerHeight)
        .enablePointerInteraction(true);

      // Mount the globe
      this.globe(document.getElementById('globe-container'));

      setTimeout(() => {
        try {
          this.globe.pointOfView({
            lat: 20,
            lng: -100,   // North America
            altitude: 2.0
          });
          const controls = this.globe.controls();
          if (controls && this.autoRotate) {
            controls.autoRotate = true;
            controls.autoRotateSpeed = 0.6;
            console.log('Auto-rotation started');
          }
        } catch (error) {
          console.warn('Could not start auto-rotation:', error);
        }
      }, 100);

      // Add cloud layer if enabled
      if (this.showClouds) {
        this.addCloudLayer();
      }

      // Handle window resize
      window.addEventListener('resize', () => {
        try {
          this.globe.width(window.innerWidth).height(window.innerHeight);
        } catch (error) {
          console.warn('Error during resize:', error);
        }
      });

      console.log('Globe created successfully');
    } catch (error) {
      console.error('Error creating globe:', error);
      // Fallback: show error message to user
      document.getElementById('loading').innerHTML = `
        <div style="color: #ef4444;">
          <div style="font-size: 2rem; margin-bottom: 10px;">⚠️</div>
          <div>Failed to load globe visualization</div>
          <div style="font-size: 0.9rem; margin-top: 10px;">Please check your internet connection and try refreshing</div>
        </div>
      `;
      this.hideLoading();
    }
  }

  getStatusColor(status) {
    switch (status) {
      case 'online': return '#10b981';
      case 'busy': return '#f59e0b';
      case 'offline': return '#ef4444';
      default: return '#6b7280';
    }
  }

  sortNodesForStatusList(nodes) {
    const priority = { offline: 0, busy: 1, online: 2 };
    return [...nodes].sort((left, right) =>
      (priority[left.status] ?? 3) - (priority[right.status] ?? 3) ||
      left.url.localeCompare(right.url)
    );
  }

  createTooltip(nodeData) {
    const statusColor = this.getStatusColor(nodeData.status);

    if (nodeData.isCluster) {
      // Cluster tooltip - show all nodes
      const { online, busy, offline } = nodeData.clusterStats;

      let nodeList = this.sortNodesForStatusList(nodeData.allNodes).map(node => {
        const nodeStatusColor = this.getStatusColor(node.status);
        return `
          <div class="cluster-node-row">
            <span class="cluster-node-dot" style="background: ${nodeStatusColor};"></span>
            <span class="cluster-node-url" title="${node.url}">${node.url}</span>
            <span class="cluster-node-status">(${node.status})</span>
          </div>
        `;
      }).join('');

      return `
        <div class="globe-tooltip">
          <div style="font-weight: bold; margin-bottom: 8px;">
            <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${statusColor}; margin-right: 8px;"></span>
            ${nodeData.clusterSize} nodes in ${nodeData.location}
          </div>
          <div style="margin-bottom: 8px;">
            <strong>Status Summary:</strong> ${online} online, ${busy} busy, ${offline} offline
          </div>
          <div style="max-height: 150px; overflow-y: auto; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 8px;">
            ${nodeList}
          </div>
        </div>
      `;
    } else {
      // Single node tooltip (original)
      return `
        <div class="globe-tooltip">
          <div style="font-weight: bold; margin-bottom: 8px;">
            <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${statusColor}; margin-right: 8px;"></span>
            <span title="${nodeData.url}">${nodeData.url}</span>
          </div>
          <div style="margin-bottom: 4px;"><strong>Location:</strong> ${nodeData.location}</div>
          <div style="margin-bottom: 4px;"><strong>Status:</strong> ${nodeData.status.charAt(0).toUpperCase() + nodeData.status.slice(1)}</div>
          <div style="margin-bottom: 4px;"><strong>Last working:</strong> ${this.formatLastSeen(nodeData.lastSeen)}</div>
        </div>
      `;
    }
  }

  showCustomTooltip(nodeData) {
    // Remove any existing tooltip
    this.hideCustomTooltip();

    // Get screen coordinates for the node
    const coords = this.globe.getScreenCoords(nodeData.lat, nodeData.lng, nodeData.isCluster ? 0.02 : 0.05);
    if (!coords) return;

    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.id = 'custom-globe-tooltip';
    tooltip.className = 'custom-globe-tooltip';

    const statusColor = this.getStatusColor(nodeData.status);

    let content;
    if (nodeData.isCluster) {
      // Cluster tooltip with clickable links
      const { online, busy, offline } = nodeData.clusterStats;

      let nodeList = this.sortNodesForStatusList(nodeData.allNodes).map(node => {
        const nodeStatusColor = this.getStatusColor(node.status);
        const hbUrl = node.fullUrl;

        return `
          <div class="cluster-node-row">
            <span class="cluster-node-dot" style="background: ${nodeStatusColor};"></span>
            <a class="cluster-node-url" href="${hbUrl}" target="_blank" rel="noreferrer" title="${node.url}">${node.url}</a>
            <span class="cluster-node-status">(${node.status})</span>
          </div>
        `;
      }).join('');

      content = `
        <div style="font-weight: bold; margin-bottom: 8px;">
          <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${statusColor}; margin-right: 8px;"></span>
          ${nodeData.clusterSize} nodes in ${nodeData.location}
        </div>
        <div style="margin-bottom: 8px;">
          <strong>Status Summary:</strong> ${online} online, ${busy} busy, ${offline} offline
        </div>
        <div style="max-height: 150px; overflow-y: auto; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 8px;">
          ${nodeList}
        </div>
      `;
    } else {
      // Single node tooltip with clickable links
      const hbUrl = nodeData.fullUrl;

      content = `
        <div style="font-weight: bold; margin-bottom: 8px;">
          <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${statusColor}; margin-right: 8px;"></span>
          <a class="node-hostname" href="${hbUrl}" target="_blank" title="${nodeData.url}" style="color: #60a5fa; text-decoration: none;">${nodeData.url}</a>
        </div>
        <div style="margin-bottom: 4px;"><strong>Location:</strong> ${nodeData.location}</div>
        <div style="margin-bottom: 4px;"><strong>Status:</strong> ${nodeData.status.charAt(0).toUpperCase() + nodeData.status.slice(1)}</div>
        <div style="margin-bottom: 4px;"><strong>Last working:</strong> ${this.formatLastSeen(nodeData.lastSeen)}</div>
      `;
    }

    tooltip.innerHTML = content;

    // Position tooltip
    tooltip.style.position = 'absolute';
    tooltip.style.left = `${coords.x + 15}px`;
    tooltip.style.top = `${coords.y - 10}px`;
    tooltip.style.zIndex = '1000';

    // Add hover handlers to keep tooltip visible
    let isHoveringTooltip = false;
    let isHoveringNode = true;

    tooltip.addEventListener('mouseenter', () => {
      isHoveringTooltip = true;
    });

    tooltip.addEventListener('mouseleave', () => {
      isHoveringTooltip = false;
      setTimeout(() => {
        // Double-check that we're still not hovering
        const tooltipElement = document.getElementById('custom-globe-tooltip');
        if (tooltipElement && !tooltipElement.matches(':hover')) {
          this.hideCustomTooltip();
          // Restore auto-rotate if it was on
          if (this.wasAutoRotating && this.globe && this.globe.controls()) {
            this.globe.controls().autoRotate = true;
          }
        }
      }, 100);
    });

    // Store hover state
    this.currentTooltipData = { isHoveringTooltip, isHoveringNode };

    document.body.appendChild(tooltip);
    tooltip.querySelectorAll('.cluster-node-url, .node-hostname').forEach(element => {
      fitHostnameToElement(element, element.title);
    });
  }

  hideCustomTooltip() {
    const existing = document.getElementById('custom-globe-tooltip');
    if (existing) {
      existing.remove();
    }
    if (this.currentTooltipData) {
      this.currentTooltipData.isHoveringNode = false;
    }
  }

  showNodeInfo(nodeData) {
    const panel = document.getElementById('nodeInfo');
    const details = document.getElementById('nodeDetails');

    details.innerHTML = `
      <div style="margin-bottom: 15px;">
        <span class="node-status-indicator status-${nodeData.status}"></span>
        <strong class="node-hostname" title="${nodeData.url}">${nodeData.url}</strong>
      </div>
      <div style="margin-bottom: 8px;">
        <strong>Location:</strong> ${nodeData.location}
      </div>
      <div style="margin-bottom: 8px;">
        <strong>Status:</strong> ${nodeData.status.charAt(0).toUpperCase() + nodeData.status.slice(1)}
      </div>
      <div style="margin-bottom: 8px;">
        <strong>Last working:</strong> ${this.formatLastSeen(nodeData.lastSeen)}
      </div>
      <div style="margin-bottom: 8px;">
        <strong>Coordinates:</strong> ${nodeData.lat.toFixed(4)}, ${nodeData.lng.toFixed(4)}
      </div>
    `;
    fitHostnameToElement(details.querySelector('.node-hostname'), nodeData.url);

    panel.classList.add('visible');
  }

  addCloudLayer() {
    try {
      if (this.globe) {
        this.globe
          .cloudsImageUrl('//unpkg.com/three-globe/example/img/earth-water.png')
          .cloudsAltitude(0.003)
          .cloudsOpacity(0.3);
      }
    } catch (error) {
      console.warn('Error adding cloud layer:', error);
    }
  }

  updateStats() {
    const roster = this.nodeData.flatMap(node => node.isCluster ? node.allNodes : [node]);
    const onlineNodes = roster.filter(node => node.status === 'online');
    const busyNodes = roster.filter(node => node.status === 'busy');
    const offlineNodes = roster.filter(node => node.status === 'offline');

    document.getElementById('totalNodes').textContent = roster.length;
    document.getElementById('onlineNodes').textContent = onlineNodes.length;
    document.getElementById('busyNodes').textContent = busyNodes.length;
    document.getElementById('offlineNodes').textContent = offlineNodes.length;
  }

  hideLoading() {
    const loading = document.getElementById('loading');
    if (this.nodeData.length) {
      loading?.remove();
    } else if (loading) {
      loading.innerHTML = `
        <div>No recently working HyperBEAM nodes are cached yet.</div>
        <div style="font-size: 0.9rem; margin-top: 10px; opacity: 0.75;">
          Open the main dashboard or node field view to populate the seven-day working roster.
        </div>
      `;
    }

    // Re-read the established node cache; the globe never discovers or probes nodes itself.
    this.refreshTimer = setInterval(() => {
      this.refreshFromNodeCache();
    }, 15 * 1000);

    const autoRotateBtn = document.querySelector('.control-btn');
    if (autoRotateBtn && this.autoRotate) {
      autoRotateBtn.textContent = 'Stop Rotation';
      autoRotateBtn.classList.add('active');
    }
  }
}

// Global functions
let globe;

function toggleAutoRotate() {
  if (globe && globe.globe) {
    try {
      globe.autoRotate = !globe.autoRotate;
      const controls = globe.globe.controls();
      if (controls) {
        controls.autoRotate = globe.autoRotate;
        if (globe.autoRotate) {
          controls.autoRotateSpeed = 0.6;
        }
      }
      const btn = event.target;
      btn.textContent = globe.autoRotate ? 'Stop Auto Rotate' : 'Start Auto Rotate';
      btn.classList.toggle('active', globe.autoRotate);
    } catch (error) {
      console.warn('Auto-rotate not available:', error);
      event.target.textContent = 'Auto Rotate (N/A)';
      event.target.disabled = true;
    }
  }
}

function toggleLabels() {
  if (globe && globe.globe) {
    try {
      globe.showLabels = !globe.showLabels;
      // For custom tooltips, we just toggle a flag
      // The actual show/hide is handled by hover events
      event.target.textContent = globe.showLabels ? 'Hide Node Labels' : 'Show Node Labels';
      event.target.classList.toggle('active', !globe.showLabels);
    } catch (error) {
      console.warn('Error toggling labels:', error);
    }
  }
}

function toggleClouds() {
  if (globe && globe.globe) {
    try {
      globe.showClouds = !globe.showClouds;
      if (globe.showClouds) {
        globe.addCloudLayer();
      } else {
        globe.globe.cloudsImageUrl(null);
      }
      event.target.textContent = globe.showClouds ? 'Hide Clouds' : 'Show Clouds';
      event.target.classList.toggle('active', !globe.showClouds);
    } catch (error) {
      console.warn('Error toggling clouds:', error);
    }
  }
}

function resetView() {
  if (globe && globe.globe) {
    try {
      globe.globe.pointOfView({ lat: 20, lng: -100, altitude: 2.0 }, 1000);
    } catch (error) {
      console.warn('Error resetting view:', error);
    }
  }
}

function hideNodeInfo() {
  document.getElementById('nodeInfo').classList.remove('visible');
}

function goBack() {
  window.location.href = '../../index.html';
}

// Expose functions used by inline onclicks in globe.html
Object.assign(window, {
  goBack,
  toggleAutoRotate,
  toggleLabels,
  resetView,
  hideNodeInfo
});

// Initialize globe when page loads
window.addEventListener('load', () => {
  globe = new HyperBEAMGlobe();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  try {
    if (globe?.refreshTimer) clearInterval(globe.refreshTimer);
    if (globe?.cacheUpdateHandler) window.removeEventListener(HYPERBEAM_ROSTER_EVENT, globe.cacheUpdateHandler);
    if (globe?.storageHandler) window.removeEventListener('storage', globe.storageHandler);
    if (globe && globe.globe && typeof globe.globe._destructor === 'function') {
      globe.globe._destructor();
    }
  } catch (error) {
    console.warn('Error during cleanup:', error);
  }
});
