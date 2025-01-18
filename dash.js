import { PROCESSES, generateQuery } from './processes.js';

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
                label:'',
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
                            // Convert the timestamp to local time
                            const date = new Date(context[0].label);
                            return date.toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: 'numeric',
                                hour12: true,
                                weekday: 'short'
                            });
                        }
                    }
                }
            }
        }
    });
});

// Initialize loaders to be visible when page loads
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('mainLoader').style.display = 'flex';
    Object.keys(PROCESSES).forEach(processName => {
        document.getElementById(`${processName}Loader`).style.display = 'flex';
    });
});

async function fetchHistoricalData(periods, processName) {
    try {
        const periodData = await Promise.all(periods.map(async (period) => {
            const query = generateQuery(processName, period.startHeight, period.endHeight);

            const response = await fetch('https://arweave-search.goldsky.com/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query }),
            });

            const result = await response.json();
            return result.data.transactions.count;
        }));

        // Update historical data with correct end times
        historicalData[processName] = periodData.map((count, index) => ({
            timestamp: periods[index].endTime, // Use the provided end time
            count: count,
        }));

        // Generate labels based on process type (daily vs. weekly)
        const chart = charts[processName];
        if (processName.includes('weekly')) {
            // Smarter label logic for weekly processes (+7 days)
            chart.data.labels = historicalData[processName].map((d, index, array) => {
                let labelDate;
                if (index === 0) {
                    // Use the actual end time for the first period
                    labelDate = new Date(d.timestamp);
                } else {
                    // Calculate the label as +7 days from the previous label
                    const prevLabelDate = new Date(array[index - 1].timestamp);
                    labelDate = new Date(prevLabelDate);
                    labelDate.setDate(prevLabelDate.getDate() + 7);
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
        } else {
            // Smarter label logic for daily processes (+1 day)
            chart.data.labels = historicalData[processName].map((d, index, array) => {
                let labelDate;
                if (index === 0) {
                    // Use the actual end time for the first period
                    labelDate = new Date(d.timestamp);
                } else {
                    // Calculate the label as +1 day from the previous label
                    const prevLabelDate = new Date(array[index - 1].timestamp);
                    labelDate = new Date(prevLabelDate);
                    labelDate.setDate(prevLabelDate.getDate() + 1);
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
        }

        // Update chart data and refresh
        chart.data.datasets[0].data = historicalData[processName].map((d) => d.count);
        chart.update('none'); // Force chart update without animation
        document.getElementById(`${processName}Loader`).style.display = 'none';
    } catch (error) {
        console.error(`Error fetching historical data for ${processName}:`, error);
        // Hide loader on error
        document.getElementById(`${processName}Loader`).style.display = 'none';
    }
}


async function findBlockAtTime(targetDate, currentHeight) {
    // Get rough block estimate first (average 2 min per block)
    const now = new Date();
    const minutesDiff = (now - targetDate) / (1000 * 60);
    const estimatedBlocksBack = Math.floor(minutesDiff / 2.13);
    const estimatedHeight = currentHeight - estimatedBlocksBack;
    
    // Expand search range to ensure we find the closest block
    const searchRange = 100;  // Increased search range
    const startHeight = Math.max(0, estimatedHeight - searchRange);
    const endHeight = estimatedHeight + searchRange;
    
    const blockPromises = [];
    for (let height = startHeight; height <= endHeight; height++) {
        blockPromises.push(
            fetch(`https://arweave.net/block/height/${height}`)
                .then(response => response.json())
                .then(block => ({
                    height: height,
                    timestamp: block.timestamp,
                    date: new Date(block.timestamp * 1000)
                }))
                .catch(error => {
                    console.error(`Error fetching block ${height}:`, error);
                    return null;
                })
        );
    }
    
    const blocks = (await Promise.allSettled(blockPromises))
        .filter(result => result.status === 'fulfilled' && result.value !== null)
        .map(result => result.value);
    
    // Find block closest to target time
    let bestBlock = null;
    let smallestDiff = Infinity;
    
    blocks.forEach(block => {
        const timeDiff = Math.abs(block.date - targetDate);
        if (timeDiff < smallestDiff) {
            smallestDiff = timeDiff;
            bestBlock = block;
        }
    });

    // Log the found block with both UTC and local times for verification
    if (bestBlock) {
        console.log(`For target ${targetDate.toLocaleString()}`);
        console.log(`Found block ${bestBlock.height}`);
        console.log(`UTC: ${bestBlock.date.toUTCString()}`);
        console.log(`Local: ${bestBlock.date.toLocaleString()}`);
        console.log('Time Difference (ms):', smallestDiff);
        console.log('---');
    }

    return bestBlock;
}



async function fetchWeeklyData(currentHeight) {
    try {
        // Show weekly chart loaders
        Object.keys(PROCESSES).forEach(processName => {
            if (processName.includes('weekly')) {
                document.getElementById(`${processName}Loader`).style.display = 'flex';
            }
        });

        const weeklyPeriods = await getWeeklyPeriods(currentHeight);

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

async function getWeeklyPeriods(currentHeight) {
    // Find the most recent Sunday at 0:00 UTC
    const lastCheckpoint = getLastSundayCheckpoint(new Date());

    // Get block for last Sunday checkpoint
    const lastCheckpointBlock = await findBlockAtTime(lastCheckpoint, currentHeight, 50);

    // Add current period first (from last Sunday to now)
    const periods = [{
        endTime: new Date(),
        startTime: lastCheckpoint,
        endHeight: currentHeight,
        startHeight: lastCheckpointBlock.height
    }];

    // Then add historical periods (7 weeks back)
    for (let i = 1; i < 8; i++) {
        const endDate = new Date(lastCheckpoint);
        endDate.setDate(endDate.getDate() - (i - 1) * 7);

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 7);

        const endBlock = await findBlockAtTime(endDate, currentHeight, 250);
        const startBlock = await findBlockAtTime(startDate, currentHeight, 250);

        periods.push({
            endTime: endDate,
            startTime: startDate,
            endHeight: endBlock.height,
            startHeight: startBlock.height
        });
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

async function updateBlockHeight() {
    try {
        // Show main loader
        document.getElementById('mainLoader').style.display = 'flex';

        // Show all chart loaders
        Object.keys(PROCESSES).forEach(processName => {
            document.getElementById(`${processName}Loader`).style.display = 'flex';
        });

        const response = await fetch("https://arweave.net/info");
        const data = await response.json();
        const currentHeight = data.height;
        console.log("Current Arweave height is: " + currentHeight);

        const dailyPeriods = await getDailyPeriods(currentHeight);

        // Update display and fetch daily data
        updateDisplayAndFetchData(currentHeight, dailyPeriods);

        // Fetch weekly data
        await fetchWeeklyData(currentHeight);
    } catch (error) {
        console.error(error);
        // Hide loaders on error
        document.getElementById('mainLoader').style.display = 'none';
        Object.keys(PROCESSES).forEach(processName => {
            document.getElementById(`${processName}Loader`).style.display = 'none';
        });
    }
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

async function getDailyPeriods(currentHeight) {
    // Find the most recent 0:00 UTC day
    const lastCheckpoint = getLastDailyCheckpoint(new Date());

    // Get block for last 0:00 UTC checkpoint
    const lastCheckpointBlock = await findBlockAtTime(lastCheckpoint, currentHeight, 50);

    // Add current period first (from last 0:00 UTC to now)
    const periods = [{
        endTime: new Date(),
        startTime: lastCheckpoint,
        endHeight: currentHeight,
        startHeight: lastCheckpointBlock.height
    }];

    // Then add historical periods
    for (let i = 1; i < 14; i++) {
        const endDate = new Date(lastCheckpoint);
        endDate.setUTCDate(endDate.getUTCDate() - (i - 1));

        const startDate = new Date(endDate);
        startDate.setUTCDate(startDate.getUTCDate() - 1);

        const endBlock = await findBlockAtTime(endDate, currentHeight, 50);
        const startBlock = await findBlockAtTime(startDate, currentHeight, 50);

        periods.push({
            endTime: endDate,
            startTime: startDate,
            endHeight: endBlock.height,
            startHeight: startBlock.height
        });
    }

    return periods.reverse(); // Put in chronological order
}

function getLastDailyCheckpoint(now) {
    const lastCheckpoint = new Date(now);
    lastCheckpoint.setUTCHours(0, 0, 0, 0);
    return lastCheckpoint;
}

// Initial update
updateBlockHeight();

// Update every 5 minutes
setInterval(updateBlockHeight, 20 * 60 * 1000);