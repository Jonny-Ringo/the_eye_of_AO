import { DATA_REFRESH_INTERVAL } from './config.js';
import { PROCESSES } from './processes.js';
import { warmHyperbeamNodeCache } from './hyperbeam/node-discovery.js';
import {
    fetchNetworkInfo,
    fetchBlockHistory,
    fetchProcessData,
    fetchStargridStats,
    fetchVolumeData,
    fetchArweaveTransactionAnalytics
} from './api.js';
import {
    initializeCharts,
    historicalData,
    updateChartTimeRange,
    // Disabled stablecoin chart placeholder: updateCombinedChart,
    fetchChartData,
    updateArweaveTransactionsChart
} from './charts.js';
import { 
    initializeUI, 
    toggleMainLoader, 
    toggleChartLoader, 
    updateNetworkInfoDisplay, 
    setupTimeRangeButtons,
    getChartTimeRange
} from './ui.js';
import { 
    getDailyPeriods, 
    getLastDailyCheckpoint,
    findBlockNearDate
} from './utils.js';

// Begin filling the shared roster before the rest of the dashboard has loaded.
// Every completed node probe and geolocation is persisted for the node and globe views.
warmHyperbeamNodeCache().catch(error => {
    console.error('HyperBEAM background warmup failed:', error);
});

/**
 * Fetches additional historical data for a specific process when a longer time range is selected
 * @param {string} processName - The process name
 * @param {string} timeRange - The selected time range
 * @returns {Promise<void>}
 */
export async function fetchAdditionalData(processName, timeRange) {
    try {
        
        // Fetch network info and block history if not already available
        const networkInfo = window.currentNetworkInfo || await fetchNetworkInfo();
        window.currentNetworkInfo = networkInfo;
        
        const blockData = window.currentBlockData || await fetchBlockHistory();
        window.currentBlockData = blockData;
        
        const currentHeight = networkInfo.height;
        
        // Generate more historical periods based on the selected time range
        let extendedPeriods;
        if (timeRange === '1M') {
            // For 1 month, we need to get around 30 days of data
            extendedPeriods = generateExtendedDailyPeriods(currentHeight, blockData, 30);
        } else if (timeRange === '3M') {
            // For 3 months, we need to get around 90 days of data
            extendedPeriods = generateExtendedDailyPeriods(currentHeight, blockData, 90);
        } else {
            // For shorter time ranges, use the current periods
            return; // No additional data needed
        }
        
        /* Disabled stablecoin history placeholder:
        if (processName === 'wUSDCTransfer') {
            // Similar handling for wUSDC/USDA
            await fetchAndUpdateProcessData('wUSDCTransfer', extendedPeriods, currentHeight);
            await fetchAndUpdateProcessData('USDATransfer', extendedPeriods, currentHeight);
            updateChartTimeRange('wUSDCTransfer', timeRange);
            return;
        }
        */
        
        // For single-process charts
        await fetchAndUpdateProcessData(processName, extendedPeriods, currentHeight);
        updateChartTimeRange(processName, timeRange);
    } catch (error) {
        console.error(`Error fetching additional data for ${processName}:`, error);
    }
}

// Helper function to fetch and update data for a single process
async function fetchAndUpdateProcessData(processName, periods, currentHeight) {
    // Helper function to format date as YYYY-MM-DD for comparison
    const formatDateForComparison = (date) => {
        const d = new Date(date);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    
    // Get the existing data
    const existingData = historicalData[processName] || [];
    
    // Create a map of existing data by date
    const existingDateMap = new Map();
    existingData.forEach(item => {
        const dateKey = formatDateForComparison(item.timestamp);
        existingDateMap.set(dateKey, item);
    });
    
    // Filter out periods we already have data for
    const newPeriods = periods.filter(period => {
        const dateKey = formatDateForComparison(period.endTime);
        return !existingDateMap.has(dateKey);
    });
    
    if (newPeriods.length === 0) {
        return;
    }
    
    
    // Fetch the data for new periods
    const newData = await fetchProcessData(processName, newPeriods, currentHeight);
    
    if (newData.length > 0) {
        
        // Instead of just concatenating arrays, merge while preventing duplicates
        const mergedData = [...existingData]; // Start with existing data
        
        newData.forEach(newItem => {
            const newDateKey = formatDateForComparison(newItem.timestamp);
            
            // Check if we already have data for this date
            const existingIndex = mergedData.findIndex(item => 
                formatDateForComparison(item.timestamp) === newDateKey
            );
            
            if (existingIndex >= 0) {
                // Update existing entry instead of adding a duplicate
                mergedData[existingIndex] = newItem;
            } else {
                // Add new entry if we don't have data for this date yet
                mergedData.push(newItem);
            }
        });
        
        // Sort chronologically
        const sortedData = mergedData.sort((a, b) =>
            new Date(a.timestamp) - new Date(b.timestamp)
        );

        // Update historical data
        historicalData[processName] = sortedData;
    } else {
        console.log(`No new data points found for ${processName}`);
    }
}

/**
 * Generates extended daily periods for longer historical data
 * @param {number} currentHeight - The current block height
 * @param {Array} blockData - Array of block data
 * @param {number} days - Number of days to generate
 * @returns {Array} Array of time periods
 */
export function generateExtendedDailyPeriods(currentHeight, blockData, days) {
    // Find the most recent 0:00 UTC day
    const lastCheckpoint = getLastDailyCheckpoint(new Date());
    
    // Create periods for the specified number of days
    const periods = [];
    
    // Add current period first (from last 0:00 UTC to now)
    periods.push({
        endTime: new Date(),
        startTime: lastCheckpoint,
        endHeight: currentHeight,
        startHeight: blockData[0].blockHeight
    });
    
    // Then add historical periods
    // Use the same (i - 1) alignment as getDailyPeriods so we include "yesterday".
    for (let i = 1; i < days; i++) {
        const endDate = new Date(lastCheckpoint);
        endDate.setUTCDate(endDate.getUTCDate() - (i - 1));

        const startDate = new Date(endDate);
        startDate.setUTCDate(startDate.getUTCDate() - 1);

        // Find blocks closest to these dates
        const endBlock = findBlockNearDate(blockData, endDate);
        const startBlock = findBlockNearDate(blockData, startDate);

        if (endBlock && startBlock) {
            periods.push({
                endTime: endDate,
                startTime: startDate,
                endHeight: endBlock.blockHeight,
                startHeight: startBlock.blockHeight
            });
        }
    }
    
    // Sort periods chronologically
    return periods.sort((a, b) => a.startTime - b.startTime);
}


/**
 * Updates the Stargrid chart with data 
 */
export async function updateStargridChart() {
    try {
        toggleChartLoader('stargrid', true);

        const stargridData = await fetchStargridStats();
        if (!stargridData) throw new Error('Failed to fetch Stargrid data');

        // Ensure valid date format
        const formattedData = stargridData.map(entry => ({
            ...entry,
            timestamp: new Date(entry.timestamp).toISOString()
        }));

        // Store in historicalData
        historicalData['stargrid'] = formattedData;

        // Update chart with current range
        const timeRange = getChartTimeRange('stargrid');
        updateChartTimeRange('stargrid', timeRange);

        toggleChartLoader('stargrid', false);
    } catch (error) {
        console.error('Error updating Stargrid chart:', error);
        toggleChartLoader('stargrid', false);
    }
}

/**
 * Updates volume charts with data from cache
 * @param {string} processName - The chart to update ('AOVolume')
 * @returns {Promise<Object>} The volume data
 */
export async function updateVolumeChart(processName) {
    try {
        // Get all volume data
        const volumeData = await fetchVolumeData();
        
        // Map process names to their data keys
        const tokenType = processName.replace('Volume', '');
        
        if (!volumeData[tokenType]) {
            throw new Error(`No data found for ${tokenType}`);
        }
        
        console.log(`Full ${tokenType} dataset:`, volumeData[tokenType].length, 'entries');
        
        // Format the data
        const formattedData = volumeData[tokenType].map(entry => ({
            timestamp: new Date(entry.timestamp).toISOString(),
            value: entry.value
        }));

        // Store complete dataset in historicalData
        historicalData[processName] = formattedData;
        
        return volumeData;

    } catch (error) {
        console.error(`Error updating ${processName} chart:`, error);
        throw error;
    }
}



/**
 * Initializes the dashboard with improved loader removal
 */
async function initializeDashboard() {
    try {
        // Initialize UI components first
        initializeUI();
        
        // Initialize chart instances
        initializeCharts();
        
        // Set up time range button handlers
        setupTimeRangeButtons(fetchChartData);
        
        // First fetch critical data - network info and block history
        console.log("Fetching network info and block history...");
        const networkInfoPromise = fetchNetworkInfo().catch(error => {
            console.error("Error fetching network info:", error);
            return { height: 0 }; // Return minimal valid object
        });
        
        const blockHistoryPromise = fetchBlockHistory().catch(error => {
            console.error("Error fetching block history:", error);
            return []; // Return empty array
        });
        
        // Wait for critical data
        const [networkInfo, blockData] = await Promise.all([networkInfoPromise, blockHistoryPromise]);
        
        // Store globally
        window.currentNetworkInfo = networkInfo;
        window.currentBlockData = blockData;
        
        const currentHeight = networkInfo.height;
        console.log(`Current network height: ${currentHeight}`);
        
        // Generate periods
        const dailyPeriods = getDailyPeriods(currentHeight, blockData);
        const oneWeekPeriods = generateExtendedDailyPeriods(currentHeight, blockData, 7);
        
        // Update network info display
        const latestPeriod = dailyPeriods[dailyPeriods.length - 1];
        updateNetworkInfoDisplay(currentHeight, latestPeriod);
        
        // Load a high-priority chart first and wait for it
        // This ensures users see meaningful data before removing the main loader
        try {
            await loadProcessChart('AOTransfer', oneWeekPeriods, currentHeight);
        } catch (error) {
            console.error("Error loading primary chart:", error);
            // Continue even if primary chart fails - we'll still try to remove the loader
        }
        
        // Now we can remove the main loader since at least one chart is loaded (or attempted)
        toggleMainLoader(false);
        
        // Load remaining standard daily process charts
        Object.keys(PROCESSES).forEach(processName => {
            if (processName !== 'AOTransfer') {
                // Use appropriate periods based on chart type
                // Disabled DEX period placeholders: 'permaswap', 'botega'
                const periods = ['AOTransfer', 'llamaLand','bazarAADaily', 'bazarSalesDaily'].includes(processName)
                    ? oneWeekPeriods
                    : dailyPeriods;

                // Load each chart independently
                loadProcessChart(processName, periods, currentHeight).catch(error => {
                    console.error(`Error loading ${processName} chart:`, error);
                    toggleChartLoader(processName, false);
                });
            }
        });
        
        // Fetch all-time total AO messages count
        updateTotalAoMessagesCount();

        loadDevAddressCount();
        
        loadStargridChart().catch(error => {
            console.error("Error loading Stargrid chart:", error);
            toggleChartLoader('stargrid', false);
        });

        loadStargridMatchesChart().catch(error => {
            console.error("Error loading Stargrid matches chart:", error);
            toggleChartLoader('stargridMatches', false);
        });

        loadVolumeChart('AOVolume').catch(error => {
            console.error("Error loading AO Volume chart:", error);
            toggleChartLoader('AOVolume', false);
        });

        /* Disabled stablecoin volume chart placeholder:
        loadVolumeChart('wUSDCVolume').catch(error => {
            console.error("Error loading wUSDC Volume chart:", error);
            toggleChartLoader('wUSDCVolume', false);
        });
        */

        loadArweaveTransactionsChart().catch(error => {
            console.error("Error loading Arweave transaction analytics:", error);
            toggleChartLoader('arweaveTransactions', false);
        });

    } catch (error) {
        console.error('Error initializing dashboard:', error);
        toggleMainLoader(false); // Ensure loader is removed even if there's an error
    }
}

async function loadDevAddressCount() {
  const url = "https://raw.githubusercontent.com/Jonny-Ringo/the_eye_of_AO/main/data/dev-addresses.csv";
  try {
    const response = await fetch(url);
    const text = await response.text();
    const addresses = text.trim().split(/\r?\n/).filter(line => line.length > 0);
    const count = addresses.length;
    document.getElementById('activeDevCount').textContent = count.toLocaleString();
  } catch (err) {
    console.error("Failed to load dev address count:", err);
    document.getElementById('activeDevCount').textContent = "N/A";
  }
}

/**
 * Fetches and displays the all-time total AO messages count
 */
async function updateTotalAoMessagesCount() {
    try {
        // Query for ALL-TIME total (no block height max restriction)
        const query = `query {
            transactions(
                block: { min: 0 }
                tags: [
                    { name: "Data-Protocol", values: ["ao"] }
                ]
            ) {
                count
            }
        }`;

        const response = await fetch('https://arweave-search.goldsky.com/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });

        const result = await response.json();
        const total = parseInt(result?.data?.transactions?.count) || 0;

        const element = document.getElementById('totalAoMessages');
        if (element) {
            element.textContent = total.toLocaleString();
        }

        console.log('Total AO Messages:', total.toLocaleString());
    } catch (error) {
        console.error('Error fetching all-time AO messages count:', error);
    }
}

/**
 * Loads the Stargrid chart with data from AO
 * @returns {Promise<void>} Resolves when chart is loaded
 */
async function loadStargridChart() {
    try {
      console.log("Loading Stargrid chart...");
      toggleChartLoader('stargrid', true);
      
      const stargridData = await fetchStargridStats();
      console.log(`Loaded Stargrid data: ${stargridData.length} points`);
      
      // Update historical data
      if (stargridData.length > 0) {
        historicalData['stargrid'] = stargridData;
        
        // Update the chart
        const timeRange = getChartTimeRange('stargrid');
        updateChartTimeRange('stargrid', timeRange);
      }
    } catch (error) {
      console.error("Error loading Stargrid chart:", error);
    } finally {
      toggleChartLoader('stargrid', false);
    }
}

/**
 * Loads the Stargrid match types chart showing casual vs ranked matches
 * @returns {Promise<void>} Resolves when chart is loaded
 */
async function loadStargridMatchesChart() {
    try {
        console.log("Loading Stargrid matches chart...");
        toggleChartLoader('stargridMatches', true);
        
        const stargridData = await fetchStargridStats();
        console.log(`Loaded Stargrid matches data: ${stargridData.length} points`);
        
        // Update historical data
        if (stargridData.length > 0) {
            historicalData['stargridMatches'] = stargridData;
            
            // Update the chart
            const timeRange = getChartTimeRange('stargridMatches');
            updateChartTimeRange('stargridMatches', timeRange);
        }
    } catch (error) {
        console.error("Error loading Stargrid matches chart:", error);
    } finally {
        toggleChartLoader('stargridMatches', false);
    }
}


/**
 * Loads AO volume data from the API
 * @param {string} processName - The chart to load ('AOVolume')
 * @returns {Promise<void>} Resolves when chart is loaded
 */
async function loadVolumeChart(processName) {
    try {
        console.log(`Loading ${processName} chart...`);
        toggleChartLoader(processName, true);
        
        const volumeData = await fetchVolumeData();
               
        // Map process names to their data keys
        const dataKeys = {
            'AOVolume': 'AO'
            // Disabled stablecoin volume placeholder: 'wUSDCVolume': 'wUSDC'
        };
        
        const dataKey = dataKeys[processName];
        if (!dataKey || !volumeData[dataKey]) {
            throw new Error(`No data found for ${processName}`);
        }
        const chartData = volumeData[dataKey];
        
        // Update historical data
        if (chartData.length > 0) {
            historicalData[processName] = chartData;
            
            // Update the chart
            const timeRange = getChartTimeRange(processName);
            console.log(`Time range for ${processName}:`, timeRange);
            updateChartTimeRange(processName, timeRange);
        }
    } catch (error) {
        console.error(`Error loading ${processName} chart:`, error);
    } finally {
        toggleChartLoader(processName, false);
    }
}

/**
 * Loads Arweave transaction analytics chart
 * @returns {Promise<void>}
 */
async function loadArweaveTransactionsChart() {
    try {
        console.log("Loading Arweave transaction analytics chart...");
        toggleChartLoader('arweaveTransactions', true);

        const networkInfo = window.currentNetworkInfo || await fetchNetworkInfo();
        const blockData = window.currentBlockData || await fetchBlockHistory();
        const currentHeight = networkInfo.height;

        const timeRange = getChartTimeRange('arweaveTransactions');
        const days = timeRange === '1W' ? 7 : timeRange === '1M' ? 30 : 90;

        const periods = generateExtendedDailyPeriods(currentHeight, blockData, days);

        const data = await fetchArweaveTransactionAnalytics(periods, currentHeight);

        if (data && data.length > 0) {
            historicalData['arweaveTransactions'] = data;
            updateArweaveTransactionsChart('arweaveTransactions', data);
        } else {
            console.warn("No Arweave transaction data available");
        }

    } catch (error) {
        console.error("Error loading Arweave transaction analytics:", error);
    } finally {
        toggleChartLoader('arweaveTransactions', false);
    }
}

/**
 * Loads a process chart, handling both standard and combined charts
 * @param {string} processName - The process name
 * @param {Array} periods - Time periods to fetch
 * @param {number} currentHeight - Current block height
 * @returns {Promise<void>} Resolves when chart is loaded
 */
async function loadProcessChart(processName, periods, currentHeight) {
    try {
        /* Disabled stablecoin combined-chart placeholder:
        // Skip if this is USDATransfer (handled with wUSDC)
        if (processName === 'USDATransfer') return;

        // Special handling for wUSDC/USDA combined chart
        if (processName === 'wUSDCTransfer') {
            // Fetch data for both wUSDC and USDA transfers
            const wUSDCPromise = fetchProcessData('wUSDCTransfer', periods, currentHeight)
                .catch(error => {
                    console.error("Error fetching wUSDCTransfer data:", error);
                    return [];
                });
                
            const USDAPromise = fetchProcessData('USDATransfer', periods, currentHeight)
                .catch(error => {
                    console.error("Error fetching USDATransfer data:", error);
                    return [];
                });
            
            const [wUSDCData, USDAData] = await Promise.all([wUSDCPromise, USDAPromise]);
            
            // Update historical data
            if (wUSDCData.length > 0) {
                historicalData['wUSDCTransfer'] = wUSDCData;
            }
            
            if (USDAData.length > 0) {
                historicalData['USDATransfer'] = USDAData;
            }
            
            // Update the chart
            const timeRange = getChartTimeRange('wUSDCTransfer');
            updateCombinedChart('wUSDCTransfer', 'USDATransfer', timeRange);
            toggleChartLoader(processName, false);
        }
        */

        toggleChartLoader(processName, true);

        const data = await fetchProcessData(processName, periods, currentHeight);

        if (data.length > 0) {
            historicalData[processName] = data;

            const timeRange = getChartTimeRange(processName);
            updateChartTimeRange(processName, timeRange);
            toggleChartLoader(processName, false);
        }
    } catch (error) {
        console.error(`Error loading ${processName} chart:`, error);
        throw error; // Rethrow to allow caller to handle
    }
}

// Initialize the dashboard when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initializeDashboard);

// Export for potential future use
export { initializeDashboard };
