BHtrackingProcess = "_g3kxQxL7F4Y9vXvHaR_cEa7oPkcjFpyuuHLMcHKSds"
wARtrackingProcess = "ekKjTNc7soQFx_bJJMIJYX29125XkgIsl-75aaJ7IYU"
qARtrackingProcess = "e4kbo6uYtQc9vDZ1YkwZnwXLUWL-XCUx4XhLP25vRx0"

Handlers.add(
    "ForwardCron",
    function(m)
        return m.Action == "Cron"
    end,
    function(m)
        Send({
            Target = BHtrackingProcess,
            Action = "Cron"
        })

        Send({
            Target = wARtrackingProcess,
            Action = "Cron"
        })

        Send({
            Target = qARtrackingProcess,
            Action = "Cron"
        })
    end
)