       
       
       // Globe application using globe.gl
        class HyperBEAMGlobe {
            constructor() {
                this.globe = null;
                this.nodeData = [];
                this.showLabels = true;
                this.showClouds = false;
                this.autoRotate = true;
                this.init();
            }

            async init() {
                try {
                    await this.loadNodeData();
                    this.createGlobe();
                    this.hideLoading();
                } catch (error) {
                    console.error('Error initializing globe:', error);
                    this.hideLoading();
                }
            }

            async loadNodeData() {
                try {
                    // Load real node data from your mainnet-node-list-with-locations.js
                    const response = await fetch('../mainnet-node-list.js');
                    const moduleText = await response.text();
                    
                    // Extract the mainnetNodes array from the module
                    const startIndex = moduleText.indexOf('[');
                    const endIndex = moduleText.lastIndexOf(']') + 1;
                    const arrayText = moduleText.substring(startIndex, endIndex);
                    const mainnetNodes = JSON.parse(arrayText);
                    
                    console.log(`Loaded ${mainnetNodes.length} nodes from file`);
                    
                    // Transform the data to match our globe format and check status
                    this.nodeData = this.clusterNodesByLocation(await Promise.all(mainnetNodes.map(async (node) => {
                        // Extract hostname for display
                        const hostname = this.extractHostname(node.hb);
                        
                        // Check node status (simplified - you can enhance this)
                        const status = await this.checkNodeStatus(node.hb, node.proxy);
                        
                        return {
                            url: hostname,
                            lat: node.lat,
                            lng: node.lng,
                            status: status,
                            location: node.location || 'Unknown Location',
                            country: node.country || 'Unknown',
                            fullUrl: node.hb,
                            cu: node.cu || '--',
                            proxy: node.proxy || false
                        };
                    })));

                    this.updateStats();
                } catch (error) {
                    console.error('Error loading node data:', error);
                    // Fallback to sample data if loading fails
                    this.nodeData = [
                        { 
                            url: 'Sample Node', 
                            lat: 0, 
                            lng: 0, 
                            status: 'offline', 
                            location: 'Error loading nodes',
                            fullUrl: '#',
                            cu: '--',
                            proxy: false
                        }
                    ];
                    this.updateStats();
                }
            }

            // Add this function to cluster nodes by location (only if 4+ nodes)
            clusterNodesByLocation(nodes) {
                const clusters = new Map();
                
                // First pass: group nodes by location
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
                
                // Second pass: only cluster if 4+ nodes, otherwise offset
                const result = [];
                
                clusters.forEach(cluster => {
                    const total = cluster.nodes.length;
                    
                    if (total >= 2) {
                        // Cluster mode: create single point representing all nodes
                        const { online, busy, offline } = cluster.statuses;
                        
                        let primaryStatus = 'offline';
                        if (online > 0) primaryStatus = 'online';
                        if (busy > offline && busy > online) primaryStatus = 'busy';
                        
                        result.push({
                            ...cluster.nodes[0], // Use first node as template
                            status: primaryStatus,
                            isCluster: true,
                            clusterSize: total,
                            clusterStats: cluster.statuses,
                            allNodes: cluster.nodes,
                            url: `${total} nodes in ${cluster.location}`
                        });
                    } else {
                        // Offset mode: add small random offsets to avoid overlap
                        cluster.nodes.forEach((node, index) => {
                            result.push({
                                ...node,
                                lat: node.lat + (Math.random() - 0.5) * 0.05, // Small offset
                                lng: node.lng + (Math.random() - 0.5) * 0.05, // Small offset
                                isCluster: false
                            });
                        });
                    }
                });
                
                return result;
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

            async checkNodeStatus(nodeUrl, isProxy = false) {
                try {
                    const busyTimeout = 2000;
                    const offlineTimeout = 10000;
                    const startTime = performance.now();
                    const controller = new AbortController();

                    // Use proxy worker for HTTP nodes or when proxy flag is true
                    const shouldUseProxy = isProxy || nodeUrl.startsWith('http://');
                    const urlToCheck = shouldUseProxy 
                        ? `https://node-checker-test.ravensnestx16r.workers.dev/?url=${nodeUrl}`
                        : nodeUrl;

                    const fetchOptions = {
                        method: shouldUseProxy ? 'GET' : 'HEAD',
                        signal: controller.signal,
                        mode: shouldUseProxy ? 'cors' : 'no-cors',
                        credentials: 'omit'
                    };

                    const timeoutId = setTimeout(() => controller.abort(), offlineTimeout);

                    const response = await fetch(urlToCheck, fetchOptions);
                    clearTimeout(timeoutId);
                    
                    const endTime = performance.now();
                    const responseTime = (endTime - startTime).toFixed(0);

                    if (shouldUseProxy) {
                        // Handle proxy response (JSON)
                        const data = await response.json();
                        const isOnline = data.online === true;
                        if (isOnline) {
                            return parseInt(responseTime) > busyTimeout ? 'busy' : 'online';
                        } else {
                            return 'offline';
                        }
                    } else {
                        // Handle direct response
                        return parseInt(responseTime) > busyTimeout ? 'busy' : 'online';
                    }

                    } catch (error) {
                        if (error.name === 'AbortError') {
                            return 'busy'; // Timeout suggests slow/busy
                        }
                        
                        // Check for certificate errors - these should be offline
                        if (error.message.includes('ERR_CERT') || 
                            error.message.includes('certificate') ||
                            error.message.includes('SSL') ||
                            error.message.includes('TLS')) {
                            return 'offline';
                        }
                        
                        // For CORS errors on direct requests, assume online (server responded but blocked)
                        if (error.message.includes('CORS')) {
                            return 'online';
                        }
                        
                        // Generic "Failed to fetch" could be either CORS or network - be conservative
                        if (error.message.includes('Failed to fetch')) {
                            return 'offline'; // Changed this to be more conservative
                        }
                        
                        return 'offline';
                    }
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
                            if (d.isCluster) {
                                return 0.02; // Clusters stay at base level
                            }
                            return 0.05; // Single nodes float higher
                        })
                        .pointRadius(d => {
                            if (d.isCluster) {
                                return 0.2 + (d.clusterSize * 0.015);
                            }
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

                        // Add rings for outlines
                        .ringsData(this.nodeData)
                        .ringColor(d => this.getStatusColor(d.status)) // Solid color for outline
                        .ringMaxRadius(d => {
                            const baseRadius = d.isCluster ? 0.2 + (d.clusterSize * 0.015) : 0.1;
                            return baseRadius * 1.2; // Slightly larger than the point for outline effect
                        })
                        .ringRepeatPeriod(0) // Static ring, no animation
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
                                lng: -100,      // North America
                                altitude: 2.0   // Distance from earth (1.5-3.0 typical)
                            });
                            const controls = this.globe.controls();
                            if (controls && this.autoRotate) {
                                controls.autoRotate = true;
                                controls.autoRotateSpeed = .6; // Adjust speed as needed
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
                switch(status) {
                    case 'online': return '#10b981';
                    case 'busy': return '#f59e0b';
                    case 'offline': return '#ef4444';
                    default: return '#6b7280';
                }
            }

            createTooltip(nodeData) {
                const statusColor = this.getStatusColor(nodeData.status);
                
                if (nodeData.isCluster) {
                    // Cluster tooltip - show all nodes
                    const { online, busy, offline } = nodeData.clusterStats;
                    
                    let nodeList = nodeData.allNodes.map(node => {
                        const nodeStatusColor = this.getStatusColor(node.status);
                        return `
                            <div style="margin: 2px 0; display: flex; align-items: center;">
                                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${nodeStatusColor}; margin-right: 6px;"></span>
                                <span style="font-size: 12px;">${node.url}</span>
                                <span style="font-size: 11px; opacity: 0.7; margin-left: 4px;">(${node.status})</span>
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
                                ${nodeData.url}
                            </div>
                            <div style="margin-bottom: 4px;"><strong>Location:</strong> ${nodeData.location}</div>
                            <div style="margin-bottom: 4px;"><strong>Status:</strong> ${nodeData.status.charAt(0).toUpperCase() + nodeData.status.slice(1)}</div>
                            ${nodeData.cu !== '--' ? `<div><strong>CU:</strong> Available</div>` : '<div><strong>CU:</strong> Not Available</div>'}
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
        
        let nodeList = nodeData.allNodes.map(node => {
            const nodeStatusColor = this.getStatusColor(node.status);
            const hbUrl = node.fullUrl;
            const cuUrl = node.cu !== '--' ? node.cu : null;
            
            return `
                <div style="margin: 4px 0;">
                    <div style="display: flex; align-items: center;">
                        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${nodeStatusColor}; margin-right: 6px;"></span>
                        <a href="${hbUrl}" target="_blank" style="color: #60a5fa; text-decoration: none; font-size: 12px;">${node.url}</a>
                        <span style="font-size: 11px; opacity: 0.7; margin-left: 4px;">(${node.status})</span>
                    </div>
                    ${cuUrl ? `<div style="margin-left: 20px; margin-top: 2px;">
                        <a href="${cuUrl}" target="_blank" style="color: #a78bfa; text-decoration: none; font-size: 11px;">CU: ${cuUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>
                    </div>` : ''}
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
        const cuUrl = nodeData.cu !== '--' ? nodeData.cu : null;
        
        content = `
            <div style="font-weight: bold; margin-bottom: 8px;">
                <span style="display: inline-block; width: 12px; height: 12px; border-radius: 50%; background: ${statusColor}; margin-right: 8px;"></span>
                <a href="${hbUrl}" target="_blank" style="color: #60a5fa; text-decoration: none;">${nodeData.url}</a>
            </div>
            <div style="margin-bottom: 4px;"><strong>Location:</strong> ${nodeData.location}</div>
            <div style="margin-bottom: 4px;"><strong>Status:</strong> ${nodeData.status.charAt(0).toUpperCase() + nodeData.status.slice(1)}</div>
            ${cuUrl ? `<div style="margin-left: 16px; margin-top: 4px;">
                <a href="${cuUrl}" target="_blank" style="color: #a78bfa; text-decoration: none;">CU: ${cuUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>
            </div>` : '<div style="margin-left: 16px; color: #9ca3af;">CU: Not Available</div>'}
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
                
                const cuInfo = nodeData.cu && nodeData.cu !== "--" 
                    ? `<div style="margin-bottom: 8px;">
                        <strong>CU Endpoint:</strong> ${nodeData.cu}
                    </div>`
                    : '';
                
                    details.innerHTML = `
                        <div style="margin-bottom: 15px;">
                            <span class="node-status-indicator status-${nodeData.status}"></span>
                            <strong>${nodeData.url}</strong>
                        </div>
                        <div style="margin-bottom: 8px;">
                            <strong>Location:</strong> ${nodeData.location}
                        </div>
                        <div style="margin-bottom: 8px;">
                            <strong>Status:</strong> ${nodeData.status.charAt(0).toUpperCase() + nodeData.status.slice(1)}
                        </div>
                        <div style="margin-bottom: 8px;">
                            <strong>Coordinates:</strong> ${nodeData.lat.toFixed(4)}, ${nodeData.lng.toFixed(4)}
                        </div>
                        ${cuInfo}
                    `;
                
                panel.classList.add('visible');
            }

            addCloudLayer() {
                try {
                    if (this.globe) {
                        this.globe.cloudsImageUrl('//unpkg.com/three-globe/example/img/earth-water.png')
                                .cloudsAltitude(0.003)
                                .cloudsOpacity(0.3);
                    }
                } catch (error) {
                    console.warn('Error adding cloud layer:', error);
                }
            }

updateStats() {
    let totalNodes = 0;
    let online = 0;
    let busy = 0;
    let offline = 0;
    
    this.nodeData.forEach(n => {
        if (n.isCluster) {
            // For clusters, count all nodes in the cluster
            totalNodes += n.clusterSize;
            online += n.clusterStats.online;
            busy += n.clusterStats.busy;
            offline += n.clusterStats.offline;
        } else {
            // For individual nodes, count as 1
            totalNodes += 1;
            if (n.status === 'online') online++;
            else if (n.status === 'busy') busy++;
            else if (n.status === 'offline') offline++;
        }
    });
    
    document.getElementById('totalNodes').textContent = totalNodes;
    document.getElementById('onlineNodes').textContent = online;
    document.getElementById('busyNodes').textContent = busy;
    document.getElementById('offlineNodes').textContent = offline;
}

            hideLoading() {

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
                    // Try to access controls, with fallback if not available
                    const controls = globe.globe.controls();
                    if (controls) {
                        controls.autoRotate = globe.autoRotate;
                        if (globe.autoRotate) {
                            controls.autoRotateSpeed = 0.6; // Adjust speed as needed
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

        // Initialize globe when page loads
        window.addEventListener('load', () => {
            globe = new HyperBEAMGlobe();
        });

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            try {
                if (globe && globe.globe && typeof globe.globe._destructor === 'function') {
                    globe.globe._destructor();
                }
            } catch (error) {
                console.warn('Error during cleanup:', error);
            }
        });
