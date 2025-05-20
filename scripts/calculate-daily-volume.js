// scripts/calculate-daily-volume.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const fetch = require('node-fetch');

// Constants
const DATA_FILE = path.join(__dirname, '../data/volume-stats.json');
const DEFAULT_DATA = {
  lastUpdated: new Date().toISOString(),
  blockHeights: [],
  volumeData: {
    wAR: [],
    AO: [],
    wUSDC: []
  }
};

// Helper function to format date as YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Extract volume from PowerShell output properly
function extractVolumeFromOutput(output) {
  console.log("Raw script output sample: " + output.substring(0, 500) + "...");
  
  // Try to find "Final total: X" or similar at the end of the output
  const finalTotalMatch = output.match(/Final total: ([0-9,]+)/);
  if (finalTotalMatch && finalTotalMatch[1]) {
    // Remove commas and convert to number
    const volume = parseFloat(finalTotalMatch[1].replace(/,/g, ''));
    console.log(`Found final total pattern: ${finalTotalMatch[1]} → ${volume}`);
    return volume;
  }

  // Look for the last number in the output as fallback
  const lines = output.trim().split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    // Skip empty lines
    if (!line) continue;
    
    // Try to find a number format at the end of a line
    const numberMatch = line.match(/[0-9,]+(\.[0-9]+)?$/);
    if (numberMatch) {
      const volume = parseFloat(numberMatch[0].replace(/,/g, ''));
      console.log(`Found number at the end of line: "${line}" → ${volume}`);
      return volume;
    }
  }
  
  console.warn("Could not extract volume from output.");
  return null;
}

// Find the most recent entry before today
function findPreviousEntry(entries, todayStr) {
  // Sort entries by date descending
  const sortedEntries = [...entries].sort((a, b) => {
    return new Date(b.date) - new Date(a.date);
  });
  
  // Find the first entry that's before today
  return sortedEntries.find(entry => entry.date < todayStr);
}

// Main function
async function calculateDailyVolume() {
  console.log('Starting daily volume calculation process...');
  console.log('Current working directory:', process.cwd());
  console.log('Files in directory:', fs.readdirSync(process.cwd()).join(', '));
  
  try {
    // 1. Load existing data or create default structure
    let volumeStats = DEFAULT_DATA;
    if (fs.existsSync(DATA_FILE)) {
      console.log(`Loading existing data from ${DATA_FILE}`);
      volumeStats = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      console.log('Current blockHeights entries:', JSON.stringify(volumeStats.blockHeights));
    } else {
      console.log(`No existing data file found at ${DATA_FILE}, creating new structure`);
      // Create directory if it doesn't exist
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    }
    
    // 2. Get current Arweave block height
    console.log('Fetching current Arweave block height...');
    const response = await fetch('https://arweave.net/info');
    const data = await response.json();
    const currentHeight = data.height;
    console.log(`Current Arweave block height: ${currentHeight}`);
    
    // 3. Get today's date
    const today = new Date();
    const todayStr = formatDate(today);
    console.log(`Today's date: ${todayStr}`);
    
    // 4. Determine start height from previous day's end height
    let startHeight;
    let prevEntry = null;
    
    // First check each token's volumeData to find the most recent previous entry
    const allEntries = [
      ...volumeStats.volumeData.wAR,
      ...volumeStats.volumeData.AO,
      ...volumeStats.volumeData.wUSDC
    ];
    
    console.log('All existing entries:', JSON.stringify(allEntries));
    
    // Find previous entries before today (not today's entries)
    prevEntry = findPreviousEntry(allEntries, todayStr);
    
    if (prevEntry) {
      startHeight = prevEntry.endHeight;
      console.log(`Found previous entry from ${prevEntry.date} with end height: ${startHeight}`);
    } else {
      console.log("No previous entry found, using default starting point");
      startHeight = currentHeight - 800; // Approximate 1 day back
    }
    
    console.log(`FINAL HEIGHT VALUES - Start: ${startHeight}, End: ${currentHeight}`);
    
    // Skip processing if start and end heights are the same
    if (startHeight === currentHeight) {
      console.log(`Start height equals end height (${startHeight}). No blocks to process. Skipping scripts.`);
      return;
    }
    
    // 5. Update or add today's block height entry
    const todayBlockHeightIndex = volumeStats.blockHeights.findIndex(entry => entry.date === todayStr);
    if (todayBlockHeightIndex >= 0) {
      console.log(`Updating existing block height entry for ${todayStr}`);
      volumeStats.blockHeights[todayBlockHeightIndex].endHeight = currentHeight;
    } else {
      console.log(`Adding new block height entry for ${todayStr}`);
      volumeStats.blockHeights.push({
        date: todayStr,
        endHeight: currentHeight
      });
    }
    
    console.log('Updated blockHeights array:', JSON.stringify(volumeStats.blockHeights));
    
    // 6. Run each PowerShell script with the appropriate heights
    const scripts = ['wAR.ps1', 'AO.ps1', 'wUSDC.ps1'];
    
    for (const script of scripts) {
      console.log(`------------------------------------------------------------`);
      console.log(`Running ${script} with heights: ${startHeight} -> ${currentHeight}`);
      
      try {
        // Construct the command with proper escaping
        const scriptPath = path.resolve(__dirname, script);
        console.log(`Full script path: ${scriptPath}`);
        console.log(`Checking if script exists: ${fs.existsSync(scriptPath)}`);
        
        const command = `powershell -Command "& '${scriptPath}' ${startHeight} ${currentHeight}"`;
        console.log(`Executing: ${command}`);
        console.log(`Waiting for script execution...`);
        
        const startTime = Date.now();
        // Increase timeout to 10 minutes
        const result = execSync(command, { 
          encoding: 'utf8',
          timeout: 600000, // 10 minute timeout
          maxBuffer: 10 * 1024 * 1024 // 10MB buffer
        });
        const executionTime = (Date.now() - startTime) / 1000;
        console.log(`Script execution completed in ${executionTime.toFixed(2)} seconds`);
        
        // Extract volume from output properly
        const volume = extractVolumeFromOutput(result);
        
        // Determine which token this is for the data structure
        const tokenKey = script.replace('.ps1', '');
        
        // Update or add volume data entry
        const volumeEntryIndex = volumeStats.volumeData[tokenKey].findIndex(entry => entry.date === todayStr);
        if (volumeEntryIndex >= 0) {
          console.log(`Updating existing ${tokenKey} volume entry for ${todayStr}`);
          volumeStats.volumeData[tokenKey][volumeEntryIndex] = {
            date: todayStr,
            startHeight: startHeight,
            endHeight: currentHeight,  // IMPORTANT: Using the same currentHeight value consistently
            volume: volume
          };
        } else {
          console.log(`Adding new ${tokenKey} volume entry for ${todayStr}`);
          volumeStats.volumeData[tokenKey].push({
            date: todayStr,
            startHeight: startHeight,
            endHeight: currentHeight,  // IMPORTANT: Using the same currentHeight value consistently
            volume: volume
          });
        }
        
        console.log(`Successfully processed ${script}: Volume = ${volume}`);
      } catch (scriptError) {
        console.error(`Error running ${script}:`, scriptError);
        console.error('Error message:', scriptError.message);
        if (scriptError.stdout) console.log('Error stdout:', scriptError.stdout);
        if (scriptError.stderr) console.log('Error stderr:', scriptError.stderr);
        
        // Add placeholder with error flag if needed
        const tokenKey = script.replace('.ps1', '');
        const volumeEntryIndex = volumeStats.volumeData[tokenKey].findIndex(entry => entry.date === todayStr);
        
        if (volumeEntryIndex < 0) {
          // Only add error entry if no entry exists for today
          volumeStats.volumeData[tokenKey].push({
            date: todayStr,
            startHeight: startHeight,
            endHeight: currentHeight,  // IMPORTANT: Using the same currentHeight value consistently
            volume: null,
            error: true
          });
        }
      }
    }
    
    // 7. Update lastUpdated timestamp
    volumeStats.lastUpdated = new Date().toISOString();
    
    // 8. Write updated data back to file
    console.log('Writing updated data to file...');
    fs.writeFileSync(DATA_FILE, JSON.stringify(volumeStats, null, 2));
    console.log('Volume calculation complete and saved to data/volume-stats.json');
    
  } catch (error) {
    console.error('Error in volume calculation process:', error);
    process.exit(1);
  }
}

// Run the process
calculateDailyVolume();
