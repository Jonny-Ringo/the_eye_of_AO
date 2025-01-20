

const INITIAL_PERMASWAP_ADDRESSES = [
            "xZwIYa2DapmKmOpqOn9iMN0YQnYV4hgtwKadiKBpbt8",
            "SMKH5JnFE7c0MjsURMVRZn7kUerg1yMwcnVbWJJBEDU",
            "tnzfEWXA9CRxr9lBGZbZfVEZux44lZj3pqMJCK5cHgc",
            "dBbZhQoV4Lq9Bzbm0vlTrHmOZT7NchC_Dillbmqx0tM",
            "vJY-ed1Aoa0pGgQ30BcpO9ehGBu1PfNHUlwV9W8_n5A",
            "-9lYCEgMbASuQMr76ddhnaT3H996UFjMPc5jOs3kiAk",
            "qhMOXu9ANdOmOE38fHC3PnJuRsAQ6JzGFNq09oBSmpM",
            "7AOIMfTZVpX52-XYBDS7VHsXdqEYYsGdYND_MoEVEwg",
];

const PROCESSES = {
    permaswap: {
        description: "Permaswap Order Notice Processes",
        protocol: "ao",
        action: "Order-Notice",
        spawnerProcess: "5G5_ftQT6f2OsmJ8EZ4-84eRcIMNEmUyH9aQSD85f9I",

    },
    botega: {
        description: "Botega Order Confirmation Processes",
        protocol: "ao",
        action: "Order-Confirmation",
        spawnerProcess: "3XBGLrygs11K63F_7mldWz4veNx6Llg6hI2yZs8LKHo",
    },

    qARTransfer: {
        description: "qAR Token Transfer",
        recipients: ["NG-0lVX882MG5nhARrSzyprEK6ejonHpdUmaaMPsHE8"],
        action: "Transfer"
    },
    qARweeklyTransfer: {
        description: "qAR Weekly Token Transfer",
        recipients: ["NG-0lVX882MG5nhARrSzyprEK6ejonHpdUmaaMPsHE8"],
        action: "Transfer"
    },
    wARTransfer: {
        description: "wAR Token Transfer",
        recipients: ["xU9zFkq3X2ZQ6olwNVvr1vUWIjc3kXTWr7xKQD6dh10"],
        action: "Transfer"
    },
    wARweeklyTransfer: {
        description: "wAR Weekly Token Transfer",
        recipients: ["xU9zFkq3X2ZQ6olwNVvr1vUWIjc3kXTWr7xKQD6dh10"],
        action: "Transfer"
    },
    llamaLand: {
        description: "LlamaLand Login Info",
        fromProcess: "2dFSGGlc5xJb0sWinAnEFHM-62tQEbhDzi1v5ldWX5k",
        action: "Login-Info",
        message: "No Reward"
    }
};

// Function to fetch Permaswap processes
async function fetchPermaswapProcesses() {
    const buildQuery = (cursor) => `
        query {
            transactions(
            block: {min: 0}
                tags: [
                    { name: "From-Process", values: "5G5_ftQT6f2OsmJ8EZ4-84eRcIMNEmUyH9aQSD85f9I" }
                    { name: "Action", values: "Spawned" }
                ],
                first: 100,
                after: ${cursor ? `"${cursor}"` : null}
            ) {
                edges {
                    node {
                        id
                        tags {
                            name
                            value
                        }
                    }
                    cursor
                }
                pageInfo {
                    hasNextPage
                }
            }
        }
    `;

    const processAddresses = new Set();
    let hasNextPage = true;
    let cursor = null;
    let pageNum = 1;

    console.log("Starting to fetch Permaswap processes...");

    while (hasNextPage) {
        console.log(`Fetching page ${pageNum}...`);
        pageNum++;

        try {
            const response = await fetch('https://arweave-search.goldsky.com/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: buildQuery(cursor) }),
            });

            const result = await response.json();

            if (result.errors) {
                console.error('GraphQL errors:', result.errors);
                break;
            }

            const transactions = result.data.transactions;

            // Process current page
            transactions.edges.forEach((edge) => {
                const processTags = edge.node.tags.filter((tag) => tag.name === "Process");
                processTags.forEach((processTag) => {
                    processAddresses.add(processTag.value);
                });
            });

            // Check if there's another page
            hasNextPage = transactions.pageInfo.hasNextPage;
            if (hasNextPage) {
                cursor = transactions.edges[transactions.edges.length - 1].cursor;
                console.log(`Updated cursor to: ${cursor}`);
            } else {
                console.log("No more pages to fetch.");
            }
        } catch (error) {
            console.error('Error during fetch:', error);
            break;
        }
    }

        // Add manually specified addresses
        const manualAddresses = [
            "xZwIYa2DapmKmOpqOn9iMN0YQnYV4hgtwKadiKBpbt8",
            "SMKH5JnFE7c0MjsURMVRZn7kUerg1yMwcnVbWJJBEDU",
            "tnzfEWXA9CRxr9lBGZbZfVEZux44lZj3pqMJCK5cHgc",
            "dBbZhQoV4Lq9Bzbm0vlTrHmOZT7NchC_Dillbmqx0tM",
            "vJY-ed1Aoa0pGgQ30BcpO9ehGBu1PfNHUlwV9W8_n5A",
            "-9lYCEgMbASuQMr76ddhnaT3H996UFjMPc5jOs3kiAk",
            "qhMOXu9ANdOmOE38fHC3PnJuRsAQ6JzGFNq09oBSmpM",
            "7AOIMfTZVpX52-XYBDS7VHsXdqEYYsGdYND_MoEVEwg",
        ];
    
        manualAddresses.forEach((address) => processAddresses.add(address));
    
        const processList = Array.from(processAddresses);
    
        console.log('Total Extracted Permaswap Process Addresses:', processList.length);
        console.log('Extracted Permaswap Process Addresses:', processList);
    
        return processList;
}

// Function to fetch Botega processes
async function fetchBotegaProcesses() {
    const buildQuery = (cursor) => `
        query {
            transactions(
                block: { min: 0 }
                tags: [
                    { name: "From-Process", values: "3XBGLrygs11K63F_7mldWz4veNx6Llg6hI2yZs8LKHo" }
                    { name: "Action", values: "Spawned" }
                ],
                first: 100,
                after: ${cursor ? `"${cursor}"` : null}
            ) {
                edges {
                    node {
                        id
                        tags {
                            name
                            value
                        }
                    }
                    cursor
                }
                pageInfo {
                    hasNextPage
                }
            }
        }
    `;

    const processAddresses = new Set();
    let hasNextPage = true;
    let cursor = null;
    let pageNum = 1;

    console.log("Starting to fetch Botega processes...");

    while (hasNextPage) {
        console.log(`Fetching page ${pageNum}...`);
        pageNum++;

        try {
            const response = await fetch('https://arweave-search.goldsky.com/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query: buildQuery(cursor) }),
            });

            const result = await response.json();

            if (result.errors) {
                console.error('GraphQL errors:', result.errors);
                break;
            }

            const transactions = result.data.transactions;

            // Process current page
            transactions.edges.forEach((edge) => {
                // Check for the presence of tags before filtering
                if (edge.node.tags) {
                    const processTags = edge.node.tags.filter((tag) => tag.name === "Process");
                    processTags.forEach((processTag) => {
                        processAddresses.add(processTag.value);
                    });
                } else {
                    console.warn("Skipping edge with missing tags:", edge);
                }
            });
            

            // Check if there's another page
            hasNextPage = transactions.pageInfo.hasNextPage;
            if (hasNextPage) {
                cursor = transactions.edges[transactions.edges.length - 1].cursor;
                console.log(`Updated cursor to: ${cursor}`);
            } else {
                console.log("No more pages to fetch.");
            }
        } catch (error) {
            console.error('Error during fetch:', error);
            break;
        }
    }

    const processList = Array.from(processAddresses);

    console.log('Total Extracted Botega Process Addresses:', processList.length);
    console.log('Extracted Botega Process Addresses:', processList);

    return processList;
}


async function generateQuery(processType, startHeight, endHeight, currentHeight) {
    const process = PROCESSES[processType];
    
    if (!process) {
        throw new Error(`Unknown process type: ${processType}`);
    }

    // If endHeight is current block height, only use min for live data
    const blockRange = endHeight === currentHeight 
        ? `block: { min: ${startHeight} }`
        : `block: { min: ${startHeight}, max: ${endHeight} }`;

    switch(processType) {
        case 'permaswap':
            // Dynamically fetch addresses for Permaswap
            const permaswapAddresses = await fetchPermaswapProcesses();
            console.log(`Permaswap Addresses for block range ${startHeight}-${endHeight}:`, permaswapAddresses);

            return `query {
                transactions (
                    ${blockRange}
                    tags: [
                        { name: "Data-Protocol", values: ["${process.protocol}"] }
                        { name: "Action", values: ["${process.action}"] }
                        { values: ${JSON.stringify(permaswapAddresses)} }
                    ]
                ) {
                    count
                }
            }`;

        case 'botega':
        // Dynamically fetch addresses for Botega
        const botegaAddresses = await fetchBotegaProcesses();
        console.log(`Botega Addresses for block range ${startHeight}-${endHeight}:`, botegaAddresses);

        return `query {
            transactions (
                ${blockRange}
                tags: [
                    { name: "Data-Protocol", values: ["${process.protocol}"] }
                    { name: "Action", values: ["${process.action}"] }
                    { values: ${JSON.stringify(botegaAddresses)} }
                ]
            ) {
                count
            }
        }`;


        // Other processes remain the same
        case 'qARTransfer':
        case 'qARweeklyTransfer':
        case 'wARTransfer':
        case 'wARweeklyTransfer':
            return `query {
                transactions (
                    ${blockRange}
                    recipients:${JSON.stringify(process.recipients)}
                    tags:[
                        { name:"Action", values: ["${process.action}"]},
                    ]
                ) {
                    count
                }
            }`;

        case 'llamaLand':
            return `query {
                transactions(
                    ${blockRange}
                    tags: [
                        { name: "From-Process", values: "${process.fromProcess}"}
                        { name: "Action", values: "${process.action}" },
                        { name: "Message", values: "${process.message}" },
                    ],
                    sort: HEIGHT_DESC
                ) {
                    count
                }
            }`;

        default:
            throw new Error(`Query template not found for process type: ${processType}`);
    }
}

export { PROCESSES, generateQuery };