# User Story: Add AO Daily Messages Chart to Dashboard

## Summary

We are adding a new row of charts to the main dashboard directly beneath the existing tabs (**Active Developers**, **HB Nodes**, **Coming Soon**). The first chart in that row will display AO daily and total messages.

## Goals

* Display daily AO message counts using blockheight-based day boundaries (consistent with other charts).
* Show the **total number of AO messages** in the top corner of the chart.
* On hover, show the message count for that specific day.
* Query data using GraphQL filtered by tag: `Data-Protocol: ao`.
* Position this chart as the first of three new charts in the new top-row section.

## Requirements

### Functional

1. Implement a GraphQL query that retrieves AO-related messages using:

   * Tag filter: `Data-Protocol = "ao"`.
   * Block height window parameters (`minHeight`, `maxHeight`).
2. Convert block timestamps into daily buckets.
3. Aggregate per-day message counts.
4. Calculate total AO messages from the same dataset.
5. Render a time-series chart (line or area chart) with:

   * X-axis = days
   * Y-axis = message count
   * Tooltip showing daily count
   * Total count displayed prominently
6. Insert this chart directly under the tabbed section.
7. Prepare space for two additional charts in the same row.

### Non‑Functional

* Must follow existing dashboard visual style.
* Must load quickly and handle large data sets effectively.
* Must be responsive for desktop and tablet.

## Acceptance Criteria

* The chart appears directly below the dashboard tabs.
* The chart loads AO message data filtered by the correct tag.
* The chart displays the total number of messages.
* Hovering on any point on the chart shows the correct daily count.
* The chart integrates cleanly with the layout for the upcoming two sibling charts.

## Dependencies

* Existing GraphQL client and queries pattern.
* Shared blockheight-window logic from other dashboard charts.
* Current dashboard chart styling components.

## Tasks

1. Create new GraphQL query for AO messages.
2. Create utility function to bucket messages by day.
3. Implement React chart component.
4. Add total count UI element.
5. Position chart in new three‑column layout.
6. Test with real data.
7. Final UI/UX polish.

## Notes

This is the first of three charts being added to this new section. Once this chart is complete, the same structure will be extended for the next two charts.
