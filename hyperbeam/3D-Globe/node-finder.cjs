// node-location-finder.js
// Usage: node node-finder.js <url-or-ip>
// Example: node node-finder.js hb.perplex.finance

const https = require('https');
const http = require('http');

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
    console.log(`Looking up: ${hostname}`);
    
    // Try multiple services
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
                        country: data.countryCode,
                        timezone: data.timezone,
                        isp: data.isp
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
                        country: data.country_code,
                        timezone: data.timezone,
                        isp: data.org
                    };
                }
                return null;
            }
        }
    ];

    for (const service of services) {
        try {
            console.log(`Trying ${service.name}...`);
            const data = await makeRequest(service.url);
            const location = service.parse(data);
            
            if (location) {
                console.log(`✅ Success with ${service.name}`);
                return location;
            }
        } catch (error) {
            console.log(`❌ ${service.name} failed: ${error.message}`);
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    return {
        lat: 0,
        lng: 0,
        location: `Unknown Location (${hostname})`,
        country: 'Unknown',
        error: 'No location found'
    };
}

// Command line usage
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('Usage: node node-location-finder.js <url-or-ip>');
        console.log('Example: node node-location-finder.js hb.perplex.finance');
        console.log('Example: node node-location-finder.js 185.177.124.64');
        return;
    }

    const input = args[0];
    const location = await getLocation(input);
    
    console.log('\n📍 Result:');
    console.log(JSON.stringify(location, null, 2));
    
    // Also output in a format easy to copy into your node list
    console.log('\n📋 For your node list:');
    console.log(`lat: ${location.lat},`);
    console.log(`lng: ${location.lng},`);
    console.log(`location: "${location.location}",`);
    console.log(`country: "${location.country}",`);
}

if (require.main === module) {
    main().catch(console.error);
}