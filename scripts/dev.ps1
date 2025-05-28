# Create data folder
New-Item -ItemType Directory -Path "data" -Force | Out-Null

# Arweave block info endpoint
$arweaveInfoUrl = "https://arweave.net/info"

Write-Host "Fetching current block height from Arweave..."

try {
    $blockInfo = Invoke-RestMethod -Uri $arweaveInfoUrl -Method Get
    $EndHeight = [int]$blockInfo.height
    $StartHeight = $EndHeight - 127000

    Write-Host "Current height: $EndHeight"
    Write-Host "Start height (approx. 6 months ago): $StartHeight"
} catch {
    Write-Error "Failed to fetch block height from Arweave.net: $_"
    exit 1
}

# GraphQL endpoint
$graphqlUrl = "https://arweave-search.goldsky.com/graphql"

# Set to store unique addresses
$uniqueAddresses = @{}

# Pagination variables
$hasNextPage = $true
$cursor = $null
$pageCount = 0

Write-Host "Fetching unique developers between blocks $StartHeight and $EndHeight..."

while ($true) { 
    $pageCount++
    Write-Host "Processing page $pageCount..."

    # Build GraphQL query
    if ($cursor) {
        $query = @"
        query(`$cursor: String) {
            transactions(
                tags: [{ name: "Type", values: ["manifest"] }],
                block: { min: $StartHeight, max: $EndHeight },
                first: 100,
                after: `$cursor,
                sort: HEIGHT_DESC
            ) {
                edges {
                    node {
                        id
                        owner { address }
                        block { timestamp }
                    }
                    cursor
                }
                pageInfo { hasNextPage }
            }
        }
"@
        $variables = @{ cursor = $cursor }
        $body = @{ query = $query; variables = $variables } | ConvertTo-Json -Depth 10
    } else {
        $query = @"
        {
            transactions(
                tags: [{ name: "Type", values: ["manifest"] }],
                block: { min: $StartHeight, max: $EndHeight },
                first: 100,
                sort: HEIGHT_DESC
            ) {
                edges {
                    node {
                        id
                        owner { address }
                        block { timestamp }
                    }
                    cursor
                }
                pageInfo { hasNextPage }
            }
        }
"@
        $body = @{ query = $query } | ConvertTo-Json -Depth 10
    }

    try {
        $response = Invoke-RestMethod -Uri $graphqlUrl -Method Post -Body $body -ContentType "application/json"

        if ($response.errors) {
            Write-Error "GraphQL errors: $($response.errors | ConvertTo-Json)"
            break
        }

        $transactions = $response.data.transactions.edges
        Write-Host "Found $($transactions.Count) transactions on this page"

        foreach ($edge in $transactions) {
            $address = $edge.node.owner.address
            $uniqueAddresses[$address] = $true
        }

        $currentUniqueCount = $uniqueAddresses.Keys.Count
        Write-Host "Unique addresses so far: $currentUniqueCount" -ForegroundColor Green

        $sampleAddresses = $transactions[0..2] | ForEach-Object { $_.node.owner.address }
        Write-Host "Sample addresses: $($sampleAddresses -join ', ')" -ForegroundColor Cyan

        $hasNextPage = $response.data.transactions.pageInfo.hasNextPage
        $cursor = $response.data.transactions.edges[-1].cursor

        if (-not $hasNextPage) {
            Write-Host "Reached final page"
            break
        }
    } catch {
        Write-Error "Error making GraphQL request: $_"
        break
    }

    Start-Sleep -Milliseconds 100
}

# Finalize and write to CSV
$uniqueCount = $uniqueAddresses.Keys.Count
Write-Host "Processed $pageCount pages"
Write-Host "Final total: $uniqueCount"

$csvPath = "data/dev-addresses.csv"
$uniqueAddresses.Keys | Sort-Object | Set-Content -Path $csvPath

Write-Host "Saved to: $csvPath"

