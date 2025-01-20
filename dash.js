import { createDataItemSigner, dryrun, message, result, results } from "https://unpkg.com/@permaweb/aoconnect@0.0.59/dist/browser.js";
import { PROCESSES, generateQuery } from './processes.js';

// Block Tracking Process ID
const BLOCK_TRACKING_PROCESS = '_g3kxQxL7F4Y9vXvHaR_cEa7oPkcjFpyuuHLMcHKSds';

// Store historical data for each query
const historicalData = {
    qARTransfer: [],
    wARTransfer: [],
    permaswap: [],
    botega: [],
    llamaLand: []
};

const charts = {};
Chart.defaults.plugins.legend.display = false;

// Update the chart initialization to use PROCESSES
Object.keys(PROCESSES).forEach(processName => {
    const ctx = document.getElementById(processName + 'Chart').getContext('2d');
    charts[processName] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '',
                data: [],
                borderColor: 'rgb(0, 0, 0)',
                tension: 0.1,
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true
                },
                x: {
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        callback: function(value, index, ticks) {
                            // Convert UTC to local time
                            const date = new Date(this.getLabelForValue(value));
                            return date.toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: 'numeric',
                                hour12: true
                            });
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const dataPoint = historicalData[processName][context.dataIndex];
                            const count = dataPoint.count;

                            // If this is the latest period, show "Current data as of [timestamp]"
                            if (context.dataIndex === historicalData[processName].length - 1) {
                                const currentTime = new Date().toLocaleString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: 'numeric',
                                    hour12: true
                                });
                                return `Count: ${count} (Current data as of ${currentTime})`;
                            }

                            return `Count: ${count}`;
                        },
                        title: function(context) {
                            // Get the data index
                            const dataIndex = context[0].dataIndex;
                        
                            // Retrieve the correct timestamp from historical data
                            const dataPoint = historicalData[processName][dataIndex];
                            const date = new Date(dataPoint.timestamp); // Use the correct timestamp
                        
                            // Format the date using UTC to ensure consistency
                            return date.toLocaleString('en-US', {
                                year: 'numeric', // Explicitly include the year
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: 'numeric',
                                hour12: true,
                                weekday: 'short',
                            });
                        }
                        
                    }
                }
            }
        }
    });
});


// Debugging function to log chart details
function logChartDetails() {
    Object.keys(charts).forEach(processName => {
        console.log(`Chart for ${processName}:`, {
            labels: charts[processName].data.labels,
            data: charts[processName].data.datasets[0].data,
            historicalData: historicalData[processName]
        });
    });
}
logChartDetails();

// Initialize loaders to be visible when page loads
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('mainLoader').style.display = 'flex';
    Object.keys(PROCESSES).forEach(processName => {
        document.getElementById(`${processName}Loader`).style.display = 'flex';
    });
});


async function fetchBlockHeights() {
    try {
        // First, get the current Arweave block height
        const infoResponse = await fetch("https://arweave.net/info");
        const networkInfo = await infoResponse.json();
        const currentHeight = networkInfo.height;
        console.log("Current Arweave network height is: " + currentHeight);

        // Dry run to get block history from AO process
        const blockHistoryResponse = await dryrun({
            process: BLOCK_TRACKING_PROCESS,
            data: '',
            tags: [
                { name: "Action", value: "BlocksHistory" },
                { name: "Data-Protocol", value: "ao" },
                { name: "Type", value: "Message" },
                { name: "Variant", value: "ao.TN.1" }
            ],
        });

        // Check if we have a valid response
        if (
            blockHistoryResponse && 
            blockHistoryResponse.Messages && 
            blockHistoryResponse.Messages[0] && 
            blockHistoryResponse.Messages[0].Tags
        ) {
            // Find the DailyBlocks tag
            const dailyBlocksTag = blockHistoryResponse.Messages[0].Tags.find(
                tag => tag.name === "DailyBlocks"
            );

            if (!dailyBlocksTag) {
                throw new Error("No DailyBlocks tag found in the response.");
            }

            const blockData = JSON.parse(dailyBlocksTag.value);
            
            // Sort blocks by date (descending)
            blockData.sort((a, b) => new Date(b.date) - new Date(a.date));

            // Generate periods based on block history, using current network height
            const dailyPeriods = await getDailyPeriods(currentHeight, blockData);
            updateDisplayAndFetchData(currentHeight, dailyPeriods);

            // Fetch weekly data
            await fetchWeeklyData(currentHeight, blockData);
        } else {
            throw new Error("No valid block height data found in the response.");
        }
    } catch (error) {
        console.error("Error fetching block heights:", error);
        // Hide loaders on error
        document.getElementById('mainLoader').style.display = 'none';
        Object.keys(PROCESSES).forEach(processName => {
            document.getElementById(`${processName}Loader`).style.display = 'none';
        });
    }
}

async function getDailyPeriods(currentHeight, blockData) {
    // Find the most recent 0:00 UTC day
    const lastCheckpoint = getLastDailyCheckpoint(new Date());

    // Add current period first (from last 0:00 UTC to now)
    const periods = [{
        endTime: new Date(),
        startTime: lastCheckpoint,
        endHeight: currentHeight,
        startHeight: blockData[0].blockHeight
    }];

    // Then add historical periods
    for (let i = 1; i < 14; i++) {
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

    return periods.reverse(); // Put in chronological order
}

function findBlockNearDate(blockData, targetDate) {
    return blockData.reduce((closest, block) => {
        const blockDate = new Date(block.date);
        const currentClosestDate = closest ? new Date(closest.date) : null;
        
        const blockTimeDiff = Math.abs(blockDate - targetDate);
        const closestTimeDiff = currentClosestDate 
            ? Math.abs(currentClosestDate - targetDate) 
            : Infinity;

        return blockTimeDiff < closestTimeDiff ? block : closest;
    }, null);
}

async function fetchWeeklyData(currentHeight, blockData) {
    try {
        // Show weekly chart loaders
        Object.keys(PROCESSES).forEach(processName => {
            if (processName.includes('weekly')) {
                document.getElementById(`${processName}Loader`).style.display = 'flex';
            }
        });

        const weeklyPeriods = await getWeeklyPeriods(currentHeight, blockData);

        // Fetch historical data for weekly processes
        for (const processName of Object.keys(PROCESSES)) {
            if (processName.includes('weekly')) {
                await fetchHistoricalData(weeklyPeriods, processName);
            }
        }

        // Hide weekly chart loaders
        Object.keys(PROCESSES).forEach(processName => {
            if (processName.includes('weekly')) {
                document.getElementById(`${processName}Loader`).style.display = 'none';
            }
        });
    } catch (error) {
        console.error(error);
        // Hide weekly loaders on error
        Object.keys(PROCESSES).forEach(processName => {
            if (processName.includes('weekly')) {
                document.getElementById(`${processName}Loader`).style.display = 'none';
            }
        });
    }
}

async function getWeeklyPeriods(currentHeight, blockData) {
    // Find the most recent Sunday at 0:00 UTC
    const lastCheckpoint = getLastSundayCheckpoint(new Date());

    // Add current period first (from last Sunday to now)
    const periods = [{
        endTime: new Date(),
        startTime: lastCheckpoint,
        endHeight: currentHeight,
        startHeight: blockData[0].blockHeight
    }];

    // Then add historical periods (7 weeks back)
    for (let i = 1; i < 8; i++) {
        const endDate = new Date(lastCheckpoint);
        endDate.setDate(endDate.getDate() - (i - 1) * 7);

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 7);

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

    return periods.reverse(); // Put in chronological order
}

function getLastSundayCheckpoint(now) {
    // Set the time to 0:00 UTC
    const sunday = new Date(now);
    sunday.setUTCHours(0, 0, 0, 0);

    // Go back to the most recent Sunday
    const dayOfWeek = sunday.getUTCDay();
    sunday.setUTCDate(sunday.getUTCDate() - dayOfWeek);

    // If the current time is before Sunday 0:00 UTC, go back one week
    if (now < sunday) {
        sunday.setUTCDate(sunday.getUTCDate() - 7);
    }

    return sunday;
}

function getLastDailyCheckpoint(now) {
    const lastCheckpoint = new Date(now);
    lastCheckpoint.setUTCHours(0, 0, 0, 0);
    return lastCheckpoint;
}

function updateDisplayAndFetchData(currentHeight, periods) {
    // Update display
    const latestPeriod = periods[periods.length - 1];
    const latestTime = new Date(latestPeriod.endTime);
    const timeStr = latestTime.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true
    });
    document.getElementById('blockInfo').textContent =
        `Current Block: ${currentHeight} | Latest Period (${timeStr}): ${latestPeriod.startHeight} - ${latestPeriod.endHeight}`;

    document.getElementById('mainLoader').style.display = 'none';

    // Fetch historical data for daily processes
    for (const processName of Object.keys(PROCESSES)) {
        if (!processName.includes('weekly')) {
            fetchHistoricalData(periods, processName);
        }
    }
}

// Helper function to generate consistent colors for processes
function getProcessColor(processName) {
    const colorMap = {
        permaswap: 'rgb(54, 162, 235)',
        botega: 'rgb(255, 99, 132)',
        qARTransfer: 'rgb(75, 192, 192)',
        qARweeklyTransfer: 'rgb(153, 102, 255)',
        wARTransfer: 'rgb(255, 159, 64)',
        wARweeklyTransfer: 'rgb(199, 199, 199)',
        llamaLand: 'rgb(255, 205, 86)'
    };
    return colorMap[processName] || 'rgb(0, 0, 0)';
}


async function fetchHistoricalData(periods, processName) {
    try {
        console.log(`>>> START Fetching historical data for ${processName}`);
        console.log('Periods:', JSON.stringify(periods, null, 2));

        // Verify the chart exists
        const chart = charts[processName];
        if (!chart) {
            console.error(`CRITICAL: No chart found for process: ${processName}`);
            console.log('Available charts:', Object.keys(charts));
            return;
        }

        // Generate and execute queries for each period
        const periodData = await Promise.all(periods.map(async (period, index) => {
            try {
                // Generate query with current block height
                const query = await generateQuery(
                    processName, 
                    period.startHeight, 
                    period.endHeight, 
                    periods[periods.length - 1].endHeight
                );
                console.log(`GraphQL Query for ${processName} (Period ${index}):`, query);

                const response = await fetch('https://arweave-search.goldsky.com/graphql', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ query }),
                });

                const result = await response.json();
                const count = result.data.transactions.count;
                
                console.log(`Period ${index} result for ${processName}:`, {
                    startHeight: period.startHeight,
                    endHeight: period.endHeight,
                    endTime: period.endTime,
                    count: count
                });

                return count;
            } catch (periodError) {
                console.error(`Error processing period ${index} for ${processName}:`, periodError);
                return 0;
            }
        }));

        // Update historical data
        historicalData[processName] = periodData.map((count, index) => ({
            timestamp: periods[index].endTime,
            count: count
        }));

        console.log(`Historical data for ${processName}:`, JSON.stringify(historicalData[processName], null, 2));

        // Validate historical data
        if (historicalData[processName].length === 0) {
            console.error(`NO HISTORICAL DATA for ${processName}`);
            return;
        }

        const chartLabels = historicalData[processName].map((d, index, array) => {
            let labelDate;
            if (index === 0) {
                // Use the actual end time for the first period
                labelDate = new Date(d.timestamp);
            } else {
                // Calculate the label based on process type
                const prevLabelDate = new Date(array[index - 1].timestamp);
                labelDate = new Date(prevLabelDate);
                
                // Add 1 or 7 days depending on process type
                const daysToAdd = processName.includes('weekly') ? 7 : 1;
                labelDate.setDate(prevLabelDate.getDate() + daysToAdd);
            }

            // For weekly charts, add one day
            if (processName.includes('weekly')) {
                labelDate.setDate(labelDate.getDate());
            }

            // Format the label date
            return labelDate.toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric',
                hour12: true,
            });
        });

        const chartData = historicalData[processName].map((d) => d.count);

        // Log chart preparation details
        console.log(`Chart Labels for ${processName}:`, chartLabels);
        console.log(`Chart Data for ${processName}:`, chartData);

        // Update chart
        chart.data.labels = chartLabels;
        chart.data.datasets[0].data = chartData;
        chart.data.datasets[0].label = processName;
        
        // Update chart colors dynamically
        chart.data.datasets[0].borderColor = getProcessColor(processName);

        // Force chart update
        chart.update('none');

        // Verify chart update
        console.log(`Final Chart for ${processName}:`, {
            labels: chart.data.labels,
            data: chart.data.datasets[0].data
        });

        // Hide loader
        const loader = document.getElementById(`${processName}Loader`);
        if (loader) {
            loader.style.display = 'none';
        }

        console.log(`>>> END Successfully updated chart for ${processName}`);
    } catch (error) {
        console.error(`COMPREHENSIVE ERROR for ${processName}:`, error);
        
        // Hide loader on error
        const loader = document.getElementById(`${processName}Loader`);
        if (loader) {
            loader.style.display = 'none';
        }
    }
}
// Initial update using AO block tracking
fetchBlockHeights();

// Update every 20 minutes
setInterval(fetchBlockHeights, 20 * 60 * 1000);

// Export functions if needed
export { fetchBlockHeights, fetchHistoricalData };