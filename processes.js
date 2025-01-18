// processes.js

const PROCESSES = {
    permaswap: {
        description: "Permaswap Order Notice Processes",
        protocol: "ao",
        action: "Order-Notice",
        addresses: [
            "xZwIYa2DapmKmOpqOn9iMN0YQnYV4hgtwKadiKBpbt8",
            "SMKH5JnFE7c0MjsURMVRZn7kUerg1yMwcnVbWJJBEDU",
            "tnzfEWXA9CRxr9lBGZbZfVEZux44lZj3pqMJCK5cHgc",
            "dBbZhQoV4Lq9Bzbm0vlTrHmOZT7NchC_Dillbmqx0tM",
            "vJY-ed1Aoa0pGgQ30BcpO9ehGBu1PfNHUlwV9W8_n5A",
            "-9lYCEgMbASuQMr76ddhnaT3H996UFjMPc5jOs3kiAk",
            "qhMOXu9ANdOmOE38fHC3PnJuRsAQ6JzGFNq09oBSmpM",
            "7AOIMfTZVpX52-XYBDS7VHsXdqEYYsGdYND_MoEVEwg",
            "JQecF9LdXyMOWb0F4UZcneoDR1988l8SKDW-FnM6Axk",
            "_laMMu5weQgrtDhKjd4dIOZDej7XKwXcaHJmgOcPvK4",
            "cp5016JIc7wPNEM9NKa3xLV5zPTGtvt9PdIdy0gpOyo",
            "yOeciNnbw6VdvsOhYu318Z4sGB--nprGpaIn_-jFzIY",
            "xRt-J-awbZqQ7IgzrM5yxRCS9ub0oxnyjyfmRuVU_hg",
            "230cSNf7AWy6VsBTftbTXW76xR5H1Ki42nT2xM2fA6M",
            "ke26NoD1Q3AgNQZdcO-LSfxL0gQRF1Eod39BlRqeEpY",
            "-SFWHD17LTZR12vI792gUvsM40eioWSIZ1MFvyPA3zE"
        ]
    },
    botega: {
        description: "Botega Order Confirmation Processes",
        protocol: "ao",
        action: "Order-Confirmation",
        addresses: [
            "lmaw9BhyycEIyxWhr0kF_tTcfoSoduDX8fChpHn2eQM",
            "Bv5mfnx5Ln2BU60inXPnMOGMwecJXadV4oqw7iwjzSk",
            "sCuP9nTQ8i1zWwl62z6bVnSpdzTyNnp3xVKqyGKX1rY",
            "vn5lUv8OaevTb45iI_qykad_d9MP69kuYg5mZW1zCHE",
            "9JgTfmz0d32tRSp4Z5ZNQygAPoDjWfEvdiWRsx4ECWU",
            "EJX9HmxurbeXUCaoTTo38P0Wbc5mNrLNrfW3cSg_3rM",
            "OuyYisy9BguYvrmFG-_kOsh7Zq4fw4RUGTZ0Z3X8FhA",
            "N_JfhIr5Bwz6VTnbL0quOIzn4tgw3P-zxMo0jt6Mk1g",
            "BeowMvoHuSHbDllewXW6P3QecJDa_059rxqMXQHD3ts",
            "EFGxspbF5cZEtsuXRZT1BSisOJfpYN9G0bIsDC5lyDI",
            "BHxdWnUKGlSjSOe5M6gDja4zUokHLaqoH7ykWS2y_aA",
            "Uy7d7N6s08xE8zpBpkwNQ6Iay9I5-mZvVnTYwlB-548",
            "wAxZpk1ZHezVlvm7xvYm4dDzI5DwSaaAaLPhHFxdr8w",
            "oqg_h_L6k4s9W1u3tNqTyo4DDDHiwCiAPSsV5nkG1Pc",
            "bxpz3u2USXv8Ictxb0aso3l8V9UTimaiGp9henzDsl8",
            "wvrRUDLrXmzeoIOk4vqOdjIMWG6NddkGG_GxoY6HHKg",
            "n6v-AxqxvxigDr2iH-tW1_q7z2kO6WMCudDESOCXKRg",
            "_MJbfFO79PJvVuKcqv9fF0_TABK2RlMcTJYHpyDB_8I",
            "mMUl4kDwoMHtFcVzpVQHPHJ9ypy8O9ttKYUEoCUBdrg",
            "uqk91fL2tOmMI_XYzE2cuk4bmE62gyWu_MNr-25L5Lk",
            "NX9PKbLVIyka3KPZghnEekw9FB2dfzbzVabpY-ZN1Dg",
            "nHWcfNzeqjZ8Bot4R-xs_7Jez7Fl2AeDzKlN7qWmS24",
            "O8mgmJoXJiibdXRdu8Ndze6BE5rYQ5bWW3KQuKzlRfU",
            "V-aAEX7HVu8AMOSqIhAR6myLrCZh2DOhX12OSYv5ypc",
            "4MYqWdc4_TcvVU0zoNMzuIZkUnazrSf0d-FsVjEPtSU",
            "V-aAEX7HVu8AMOSqIhAR6myLrCZh2DOhX12OSYv5ypc",
            "cT-lzIxPC41nzfkqqmgRuj9csiUmz3Fa1Q2zOmsBwc8",
            "WuAkqYvunUtsD8uvpsK9XtR7_5-fbnH3ATD4DJrl-Ac"
        ]
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

// Helper function to generate GraphQL query based on process type
function generateQuery(processType, startHeight, endHeight, currentHeight ) {
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
        case 'botega':
            return `query {
                transactions (
                    ${blockRange}
                    tags: [
                        { name: "Data-Protocol", values: ["${process.protocol}"] }
                        { name: "Action", values: ["${process.action}"] }
                        { values: ${JSON.stringify(process.addresses)} }
                    ]
                ) {
                    count
                }
            }`;

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