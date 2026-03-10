import { useState, useEffect, useRef } from 'react'
import { useNamespaceRefresh } from '../../hooks/useNamespaceRefresh.js'
import pkg from '../../../package.json'

function HealthTooltip({ ns, anchorEl }) {
    const [pos, setPos] = useState(null)

    useEffect(() => {
        if (!anchorEl) return
        const r = anchorEl.getBoundingClientRect()
        setPos({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top) })
    }, [anchorEl])

    if (!pos) return null

    const healthy = ns.healthy !== false
    const latency = ns.latencyMs != null ? `${ns.latencyMs}ms` : null
    const errorMsg = ns.error ?? null

    return (
        <div
            style={{
                position: 'fixed',
                left: pos.x,
                top: pos.y - 8,
                transform: 'translate(-50%, -100%)',
                zIndex: 9999,
                pointerEvents: 'none',
            }}
        >
            <div
                className="
                px-2.5 py-1.5 rounded-md shadow-xl
                bg-gray-900 border border-gray-700
                text-xs font-mono whitespace-nowrap
            "
            >
                <div className="flex items-center gap-2">
                    <div
                        className={`w-1.5 h-1.5 rounded-full ${healthy ? 'bg-emerald-400' : 'bg-red-400'}`}
                    />
                    <span className="text-gray-100">{ns.name}</span>
                    {latency && <span className="text-gray-400">{latency}</span>}
                    {!healthy && <span className="text-red-400">unhealthy</span>}
                </div>
                {errorMsg && (
                    <div className="mt-1 text-red-400 max-w-[220px] truncate">{errorMsg}</div>
                )}
            </div>
        </div>
    )
}

function HealthDot({ ns }) {
    const [hovered, setHovered] = useState(false)
    const ref = useRef(null)

    // Normalise string (legacy) vs health object
    const nsObj = typeof ns === 'string' ? { name: ns, healthy: true, latencyMs: null } : ns

    const healthy = nsObj.healthy !== false

    return (
        <div
            ref={ref}
            className="flex items-center gap-1.5 cursor-default select-none"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            <div
                className={`
                w-1.5 h-1.5 rounded-full flex-shrink-0
                ${healthy ? 'bg-emerald-400' : 'bg-red-400 animate-pulse'}
            `}
            />
            <span className="text-xs font-mono text-gray-500 dark:text-amber-50">
                {nsObj.name}
                {nsObj.latencyMs != null && (
                    <span className="ml-1 text-gray-400 dark:text-gray-50 tabular-nums">
                        {nsObj.latencyMs}ms
                    </span>
                )}
            </span>

            {/* Tooltip rendered at fixed position — z-9999 clears sidebar and header */}
            {hovered && <HealthTooltip ns={nsObj} anchorEl={ref.current} />}
        </div>
    )
}

function BottomBar() {
    const [namespaces, setNamespaces] = useState([])

    function fetchNs() {
        fetch('/namespaces')
            .then((r) => (r.ok ? r.json() : []))
            .then(setNamespaces)
            .catch(() => setNamespaces([]))
    }

    useEffect(() => {
        fetchNs()
        const interval = setInterval(fetchNs, 30000)
        return () => clearInterval(interval)
    }, [])

    useNamespaceRefresh(fetchNs)

    return (
        <footer
            className="
            fixed bottom-0 left-0 right-0 h-10 z-30
            flex items-center px-4 gap-4
            bg-white dark:bg-gray-900
            border-t border-gray-200 dark:border-gray-800
        "
        >
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-white flex-shrink-0">
                Namespace Health
            </span>

            <div className="flex items-center gap-5 flex-1 min-w-0">
                {namespaces.length === 0 ? (
                    <span className="text-xs text-gray-300 dark:text-white italic">
                        No connections configured
                    </span>
                ) : (
                    namespaces.map((ns) => (
                        <HealthDot key={typeof ns === 'string' ? ns : ns.name} ns={ns} />
                    ))
                )}
            </div>

            <span className="text-xs font-mono text-gray-300 dark:text-amber-50 flex-shrink-0">
                v{pkg.version}
            </span>
        </footer>
    )
}

export default BottomBar
