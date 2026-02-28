import { useState, useEffect } from 'react'
import { useNamespaceRefresh } from '../../hooks/useNamespaceRefresh.js'

function HealthDot({ ns }) {
    const [showTooltip, setShowTooltip] = useState(false)

    const dotColor = ns.healthy
        ? 'bg-emerald-400'
        : 'bg-red-400 animate-pulse'

    const latency = ns.latencyMs != null ? `${ns.latencyMs}ms` : null

    return (
        <div
            className="relative flex items-center gap-1.5"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
        >
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                {ns.name}
            </span>
            {latency && ns.healthy && (
                <span className="text-xs text-gray-300 dark:text-gray-700 font-mono">
                    {latency}
                </span>
            )}

            {/* Tooltip — shown on hover */}
            {showTooltip && (
                <div className="
                    absolute bottom-full left-0 mb-2 z-50
                    px-2.5 py-1.5 rounded shadow-lg
                    bg-gray-900 dark:bg-gray-700
                    border border-gray-700 dark:border-gray-600
                    text-xs font-mono whitespace-nowrap
                    pointer-events-none
                ">
                    {ns.healthy ? (
                        <span className="text-emerald-400">
                            ✓ Connected · {latency}
                        </span>
                    ) : (
                        <span className="text-red-400">
                            ✗ {ns.error ?? 'Unreachable'}
                        </span>
                    )}
                    {/* Tooltip arrow */}
                    <div className="
                        absolute top-full left-3
                        border-4 border-transparent
                        border-t-gray-900 dark:border-t-gray-700
                    " />
                </div>
            )}
        </div>
    )
}

function BottomBar() {
    const [namespaces, setNamespaces] = useState([])

    function fetchNs() {
        fetch('/namespaces')
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                // Handle both old string[] shape and new health object[] shape
                // gracefully during the transition
                if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'string') {
                    setNamespaces(data.map(name => ({ name, healthy: true, latencyMs: null })))
                } else {
                    setNamespaces(data)
                }
            })
            .catch(() => setNamespaces([]))
    }

    useEffect(() => {
        fetchNs()
        const interval = setInterval(fetchNs, 30000)
        return () => clearInterval(interval)
    }, [])

    useNamespaceRefresh(fetchNs)

    const healthyCount   = namespaces.filter(ns => ns.healthy).length
    const unhealthyCount = namespaces.filter(ns => !ns.healthy).length

    return (
        <footer className="
            fixed bottom-0 left-0 right-0 h-10
            flex items-center px-4 gap-6
            bg-white dark:bg-gray-900
            border-t border-gray-200 dark:border-gray-800
        ">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Namespace Health
            </span>

            <div className="flex items-center gap-4">
                {namespaces.length === 0 ? (
                    <span className="text-xs text-gray-300 dark:text-gray-700 italic">
                        No connections configured
                    </span>
                ) : (
                    namespaces.map(ns => (
                        <HealthDot key={ns.name} ns={ns} />
                    ))
                )}
            </div>

            {/* Summary badge when there are unhealthy connections */}
            {unhealthyCount > 0 && (
                <div className="
                    flex items-center gap-1.5 px-2 py-0.5 rounded
                    bg-red-50 dark:bg-red-950/30
                    border border-red-200 dark:border-red-800
                ">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-xs text-red-600 dark:text-red-400 font-mono">
                        {unhealthyCount} unreachable
                    </span>
                </div>
            )}

            <div className="ml-auto">
                <span className="text-xs text-gray-300 dark:text-gray-700 font-mono">
                    v0.1.0
                </span>
            </div>
        </footer>
    )
}

export default BottomBar