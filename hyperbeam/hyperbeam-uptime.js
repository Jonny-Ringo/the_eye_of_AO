import { 
    addCustomNode, 
    removeCustomNode, 
    loadCustomNodes, 
    customNodes,
    loadAndDisplayCustomNodes
} from './customnodes/custom.js';

import { 
    initializeMainnetNodes,
    checkAllMainnetNodes,
    getMainnetNodesTotal,
    getMainnetNodesOnline,
    getCuNodesTotal,
    getCuNodesOnline,
    checkHyperBeamNodeStatus,
    checkCuNodeStatus
} from './mainnet-nodes.js';


document.addEventListener('DOMContentLoaded', function() {
    // Get DOM elements
    const additionalNodeInput = document.getElementById('additionalNode');
    const addNodeBtn = document.getElementById('addNodeBtn');
    const removeNodeBtn = document.getElementById('removeNodeBtn');
    const customStatusContainer = document.getElementById('customStatusContainer');
    loadCustomNodes();
    
    // Add event listeners for nodes
    if (addNodeBtn) {
        addNodeBtn.addEventListener('click', function() {
            addCustomNode(additionalNodeInput, customStatusContainer);
        });
    }
    
    if (removeNodeBtn) {
        removeNodeBtn.addEventListener('click', function() {
            removeCustomNode(additionalNodeInput);
        });
    }
    
    // Handle navigation highlighting
    handleNavigationHighlighting();
    
    // Initialize the app (which should contain everything else)
    initializeApp();
});

function handleNavigationHighlighting() {
    const currentPage = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-item');
    
    navLinks.forEach(link => {
        const linkPath = link.getAttribute('href');
        
        if (currentPage.includes(linkPath) && linkPath !== "/" && linkPath !== "/index.html") {
            link.classList.add('active');
        } else if (linkPath === "/index.html" && (currentPage === "/" || currentPage === "/index.html")) {
            link.classList.add('active');
        }
    });
}

// DOM Elements
const summaryTextEl = document.getElementById('summaryText');

function initializeApp() {
    // Load custom nodes from localStorage if available
    loadCustomNodes();
    
    // Initialize mainnet nodes if the section exists
    const mainnetContent = document.getElementById('mainnetNodesContent');
    if (mainnetContent) {
        console.log("Initializing mainnet nodes...");
        initializeMainnetNodes();
    } else {
        console.warn("Mainnet nodes section not found. Skipping mainnet initialization.");
    }
    
    // Only check custom nodes if we have the container
    const customStatusContainer = document.getElementById('customStatusContainer');
    if (customStatusContainer) {
        console.log("Checking custom nodes...");
        loadAndDisplayCustomNodes(customStatusContainer);
    } else {
        console.warn("Custom nodes container not found. Skipping custom node check.");
    }
}

// Updated function to handle three states with response time consideration
function updateNodeCard(nodeCard, status, responseTime = null) {
    const statusIndicator = nodeCard.querySelector('.status-indicator');
    const statusText = nodeCard.querySelector('.status span:last-child');
    const responseTimeEl = nodeCard.querySelector('.response-time');
    
    // If we have a response time, determine status based on that
    if (responseTime !== null) {
        const busyThreshold = 2000; // 2 seconds
        
        if (parseInt(responseTime) > busyThreshold) {
            status = 'busy'; // Override the status if response time exceeds threshold
        }
    }
    
    // Set appropriate status class and text
    switch(status) {
        case 'online':
            statusIndicator.className = 'status-indicator online';
            statusText.textContent = 'Online';
            responseTimeEl.textContent = `Response time: ${responseTime}ms`;
            break;
        case 'busy':
            statusIndicator.className = 'status-indicator busy';
            statusText.textContent = 'Busy';
            responseTimeEl.textContent = responseTime ? `Response time: ${responseTime}ms` : 'Slow response...';
            break;
        case 'unavailable':
            statusIndicator.className = 'status-indicator unavailable';
            statusText.textContent = 'Unavailable';
            responseTimeEl.textContent = 'Timeout';
            break;
    }
}

function updateSummary() {
    if (!summaryTextEl) {
        console.warn("Summary text element not found. Cannot update summary.");
        return;
    }

    // Get current values from mainnet node tracker
    const mainnetHBTotal = getMainnetNodesTotal() || 0;
    const mainnetHBOnline = getMainnetNodesOnline() || 0;
    const mainnetCUTotal = getCuNodesTotal() || 0;
    const mainnetCUOnline = getCuNodesOnline() || 0;
    
    // Sanity check - ensure online count never exceeds total count
    const validatedCUOnline = Math.min(mainnetCUOnline, mainnetCUTotal);
    const validatedHBOnline = Math.min(mainnetHBOnline, mainnetHBTotal);

    // Make sure total is at least equal to online count
    const adjustedCUTotal = Math.max(mainnetCUTotal, mainnetCUOnline);
    const adjustedHBTotal = Math.max(mainnetHBTotal, mainnetHBOnline);

    const hbPercentage = adjustedHBTotal > 0
        ? ((validatedHBOnline / adjustedHBTotal) * 100).toFixed(1)
        : 0;

    const cuPercentage = adjustedCUTotal > 0
        ? ((validatedCUOnline / adjustedCUTotal) * 100).toFixed(1)
        : 0;

    summaryTextEl.innerHTML = `
        <div class="stats-section">
            <h3>HyperBEAM Nodes</h3>
            <strong>${validatedHBOnline}</strong> of <strong>${adjustedHBTotal}</strong> nodes available (${hbPercentage}%)
            <br>
            <progress value="${validatedHBOnline}" max="${adjustedHBTotal}" style="width: 70%; margin-top: 10px;"></progress>
        </div>
        
        <div class="stats-section" style="margin-top: 15px;">
            <h3>Compute Units (CU)</h3>
            <strong>${validatedCUOnline}</strong> of <strong>${adjustedCUTotal}</strong> nodes available (${cuPercentage}%)
            <br>
            <progress value="${validatedCUOnline}" max="${adjustedCUTotal}" style="width: 70%; margin-top: 10px;"></progress>
        </div>
    `;
}

export {
    updateNodeCard,
    updateSummary
};