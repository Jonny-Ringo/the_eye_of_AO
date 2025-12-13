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

# Set to store unique addresses for manifests
$manifestAddresses = @{}

# Set to store unique addresses for ao data-protocol
$aoAddresses = @{}

# Pagination variables
$hasNextPage = $true
$cursor = $null
$pageCount = 0

Write-Host "Fetching manifest developers between blocks $StartHeight and $EndHeight..."

while ($true) { 
    $pageCount++
    Write-Host "Processing manifest page $pageCount..."

    # Build GraphQL query for manifests
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
        Write-Host "Found $($transactions.Count) manifest transactions on this page"

        foreach ($edge in $transactions) {
            $address = $edge.node.owner.address
            $manifestAddresses[$address] = $true
        }

        $currentManifestCount = $manifestAddresses.Keys.Count
        Write-Host "Unique manifest addresses so far: $currentManifestCount" -ForegroundColor Green

        $hasNextPage = $response.data.transactions.pageInfo.hasNextPage
        $cursor = $response.data.transactions.edges[-1].cursor

        if (-not $hasNextPage) {
            Write-Host "Reached final manifest page"
            break
        }
    } catch {
        Write-Error "Error making GraphQL request: $_"
        break
    }

    Start-Sleep -Milliseconds 100
}

Write-Host "Total manifest developers: $($manifestAddresses.Keys.Count)" -ForegroundColor Yellow

# Now fetch ao data-protocol transactions
Write-Host "`nFetching ao data-protocol developers between blocks $StartHeight and $EndHeight..."

$hasNextPage = $true
$cursor = $null
$pageCount = 0

while ($true) { 
    $pageCount++
    Write-Host "Processing ao data-protocol page $pageCount..."

    # Build GraphQL query for ao data-protocol with App-Name filter
    if ($cursor) {
        $query = @"
        query(`$cursor: String) {
            transactions(
                tags: [
                    { name: "Data-Protocol", values: ["ao"] },
                    { name: "App-Name", values: ["aos"] }
                ],
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
                tags: [
                    { name: "Data-Protocol", values: ["ao"] },
                    { name: "App-Name", values: ["aos"] }
                ],
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
        Write-Host "Found $($transactions.Count) ao data-protocol transactions on this page"

        foreach ($edge in $transactions) {
            $address = $edge.node.owner.address
            $aoAddresses[$address] = $true
        }

        $currentAoCount = $aoAddresses.Keys.Count
        Write-Host "Unique ao data-protocol addresses so far: $currentAoCount" -ForegroundColor Green

        $hasNextPage = $response.data.transactions.pageInfo.hasNextPage
        $cursor = $response.data.transactions.edges[-1].cursor

        if (-not $hasNextPage) {
            Write-Host "Reached final ao data-protocol page"
            break
        }
    } catch {
        Write-Error "Error making GraphQL request: $_"
        break
    }

    Start-Sleep -Milliseconds 100
}

Write-Host "Total ao data-protocol developers: $($aoAddresses.Keys.Count)" -ForegroundColor Yellow

# Merge the two lists and remove duplicates
$mergedAddresses = @{}

# Add all manifest addresses
foreach ($address in $manifestAddresses.Keys) {
    $mergedAddresses[$address] = $true
}

# Add all ao addresses (duplicates won't be re-added due to hashtable behavior)
foreach ($address in $aoAddresses.Keys) {
    $mergedAddresses[$address] = $true
}

# Output results
$totalUnique = $mergedAddresses.Keys.Count
Write-Host "`n========== RESULTS ==========" -ForegroundColor Cyan
Write-Host "Manifest developers: $($manifestAddresses.Keys.Count)"
Write-Host "AO data-protocol developers: $($aoAddresses.Keys.Count)"
Write-Host "Total unique developers: $totalUnique" -ForegroundColor Green
Write-Host "============================" -ForegroundColor Cyan

# Save to CSV
$csvPath = "data/dev-addresses.csv"
$mergedAddresses.Keys | Sort-Object | Set-Content -Path $csvPath

Write-Host "Saved to: $csvPath"