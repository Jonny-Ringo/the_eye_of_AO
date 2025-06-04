// batch-node-locator.js
// Usage: node batch-node-locator.js
// Processes all nodes in mainnet-node-list.js and adds location data

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

function extractHostname(url) {
    try {
        const urlObj = new URL(url.startsWith('http') ? url : `http://${url}`);
        return urlObj.hostname;
    } catch (error) {
        const match = url.match(/^(?:https?:\/\/)?([^\/:\s]+)/);
        return match ? match[1] : url;
    }
}

function makeRequest(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        
        const timeout = setTimeout(() => {
            reject(new Error('Request timeout'));
        }, 10000);
        
        client.get(url, (res) => {
            clearTimeout(timeout);
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (error) {
                    reject(new Error('Invalid JSON response'));
                }
            });
        }).on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
    });
}

async function getLocation(input) {
    const hostname = extractHostname(input);
    
    const services = [
        {
            name: 'ip-api.com',
            url: `http://ip-api.com/json/${hostname}?fields=status,country,countryCode,region,regionName,city,lat,lon,timezone,isp`,
            parse: (data) => {
                if (data.status === 'success') {
                    return {
                        lat: data.lat,
                        lng: data.lon,
                        location: `${data.city}, ${data.regionName}, ${data.country}`,
                        country: data.countryCode
                    };
                }
                return null;
            }
        },
        {
            name: 'ipapi.co',
            url: `https://ipapi.co/${hostname}/json/`,
            parse: (data) => {
                if (data.latitude && data.longitude && !data.error) {
                    return {
                        lat: data.latitude,
                        lng: data.longitude,
                        location: `${data.city}, ${data.region}, ${data.country_name}`,
                        country: data.country_code
                    };
                }
                return null;
            }
        }
    ];

    for (const service of services) {
        try {
            const data = await makeRequest(service.url);
            const location = service.parse(data);
            
            if (location) {
                return location;
            }
        } catch (error) {
            // Continue to next service
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    return {
        lat: 0,
        lng: 0,
        location: `Unknown Location (${hostname})`,
        country: 'Unknown'
    };
}

async function processAllNodes() {
    try {
        // Import the mainnet nodes
        const { mainnetNodes } = await import('./mainnet-node-list.js');
        
        console.log(`🌍 Processing ${mainnetNodes.length} nodes...\n`);
        
        const updatedNodes = [];
        
        for (let i = 0; i < mainnetNodes.length; i++) {
            const node = mainnetNodes[i];
            console.log(`[${i + 1}/${mainnetNodes.length}] Processing: ${extractHostname(node.hb)}`);
            
            try {
                const locationData = await getLocation(node.hb);
                
                const updatedNode = {
                    ...node,
                    ...locationData
                };
                
                updatedNodes.push(updatedNode);
                console.log(`✅ Added: ${locationData.location}\n`);
                
            } catch (error) {
                console.log(`❌ Error: ${error.message}`);
                
                // Add node with unknown location
                const updatedNode = {
                    ...node,
                    lat: 0,
                    lng: 0,
                    location: `Unknown Location (${extractHostname(node.hb)})`,
                    country: 'Unknown'
                };
                
                updatedNodes.push(updatedNode);
            }
            
            // Delay between requests to be respectful to APIs
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Generate updated file
        const fileContent = `// mainnet-node-list.js with locations
// Generated: ${new Date().toISOString()}

const mainnetNodes = ${JSON.stringify(updatedNodes, null, 4)};

export { mainnetNodes };`;

        fs.writeFileSync('./mainnet-node-list-with-locations.js', fileContent);
        
        console.log('✅ Generated: mainnet-node-list-with-locations.js');
        console.log(`📊 Processed ${updatedNodes.length} nodes`);
        
        // Summary
        const located = updatedNodes.filter(n => n.country !== 'Unknown').length;
        const unknown = updatedNodes.filter(n => n.country === 'Unknown').length;
        
        console.log(`📍 Located: ${located}`);
        console.log(`❓ Unknown: ${unknown}`);
        
    } catch (error) {
        console.error('❌ Error processing nodes:', error.message);
    }
}

// Run the batch processor
processAllNodes();