import { useState, useEffect, useCallback } from 'react'
import useSidebarStore from '../../store/useSidebarStore.js'
import { LuRefreshCw, LuChevronDown, LuChevronUp } from 'react-icons/lu'

// Colour-coded null % bar: green -> yellow -> red as nulls rise
function NullBar({ pct }) {
    const colour =
        pct === 0
            ? 'bg-emerald-400 dark:bg-emerald-500'
            : pct < 5
              ? 'bg-emerald-400 dark:bg-emerald-500'
              : pct < 20
                ? 'bg-amber-400 dark:bg-amber-500'
                : 'bg-red-400 dark:bg-red-500'

    return (
        <div className="w-full h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
                className={`h-full rounded-full transition-all duration-300 ${colour}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
            />
        </div>
    )
}

// Single column card  -  collapsed by default, expands on click
function ColumnCard({ col }) {
    const [expanded, setExpanded] = useState(false)
    const nullPctFmt = col.nullPct.toFixed(1)
    const hasStats = col.mean !== '' && col.mean !== null

    return (
        <div
            className="
                rounded-md border border-gray-200 dark:border-gray-700
                bg-white dark:bg-gray-800/60
                mb-1.5 overflow-hidden transition-colors
                hover:border-blue-300 dark:hover:border-blue-700
            "
        >
            {/* Header row  -  always visible */}
            <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-left"
            >
                <span className="flex-1 min-w-0 text-xs font-mono font-semibold truncate text-gray-800 dark:text-gray-100">
                    {col.name}
                </span>
                <span className="shrink-0 text-[10px] font-mono px-1 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 uppercase">
                    {col.type}
                </span>
                {expanded ? (
                    <LuChevronUp size={12} className="shrink-0 text-gray-400 dark:text-gray-500" />
                ) : (
                    <LuChevronDown
                        size={12}
                        className="shrink-0 text-gray-400 dark:text-gray-500"
                    />
                )}
            </button>

            {/* Null bar  -  always visible below header */}
            <div className="px-2 pb-1.5">
                <NullBar pct={col.nullPct} />
                <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        {nullPctFmt}% null
                    </span>
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                        ~{fmtNum(col.approxDistinct)} distinct
                    </span>
                </div>
            </div>

            {/* Expanded detail rows */}
            {expanded && (
                <div className="border-t border-gray-100 dark:border-gray-700 px-2 py-1.5 grid grid-cols-2 gap-x-2 gap-y-1">
                    <StatRow label="Rows" value={fmtNum(col.rowCount)} />
                    <StatRow label="Nulls" value={fmtNum(col.nullCount)} />
                    <StatRow label="Min" value={col.min || '--'} />
                    <StatRow label="Max" value={col.max || '--'} />
                    {hasStats && (
                        <>
                            <StatRow label="Mean" value={fmtDecimal(col.mean)} />
                            <StatRow label="Std" value={fmtDecimal(col.std)} />
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

function StatRow({ label, value }) {
    return (
        <div className="flex flex-col min-w-0">
            <span className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {label}
            </span>
            <span
                className="text-xs font-mono truncate text-gray-700 dark:text-gray-300"
                title={value}
            >
                {value}
            </span>
        </div>
    )
}

function fmtNum(n) {
    if (n == null) return '--'
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
    return String(n)
}

function fmtDecimal(s) {
    if (!s && s !== 0) return '--'
    const n = parseFloat(s)
    return isNaN(n) ? s : n.toFixed(2)
}

// Main panel
export default function DataProfiler() {
    const { namespaces, selectedNs, setSelectedNs } = useSidebarStore()

    const [tables, setTables] = useState([])
    const [selectedTable, setSelectedTable] = useState('')
    const [profile, setProfile] = useState(null) // { namespace, table, columns }
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)

    // Fetch table list whenever namespace changes
    useEffect(() => {
        if (!selectedNs) {
            setTables([])
            setSelectedTable('')
            return
        }
        fetch(`/schema/${selectedNs}`)
            .then((r) => (r.ok ? r.json() : { tables: [] }))
            .then((data) => {
                const list = (data.tables ?? []).map((t) => t.name)
                setTables(list)
                setSelectedTable(list[0] ?? '')
            })
            .catch(() => {
                setTables([])
                setSelectedTable('')
            })
    }, [selectedNs])

    // Fetch profile when namespace or table changes
    const fetchProfile = useCallback(
        (refresh = false) => {
            if (!selectedNs) return
            const url = selectedTable
                ? `/profile/${selectedNs}/${selectedTable}${refresh ? '?refresh=true' : ''}`
                : `/profile/${selectedNs}${refresh ? '?refresh=true' : ''}`
            setLoading(true)
            setError(null)
            fetch(url)
                .then((r) => {
                    const ct = r.headers.get('content-type') ?? ''
                    if (!ct.includes('application/json')) {
                        throw new Error(
                            r.ok
                                ? 'Backend returned non-JSON - is /profile proxied? (vite.config.js)'
                                : `HTTP ${r.status}`
                        )
                    }
                    return r.json()
                })
                .then((data) => {
                    if (data.error) {
                        setError(data.error)
                        setProfile(null)
                    } else setProfile(data)
                })
                .catch((e) => setError(e.message))
                .finally(() => setLoading(false))
        },
        [selectedNs, selectedTable]
    )

    // 150ms debounce: prevents React StrictMode's double effect invocation from
    // firing two concurrent requests against the DuckDB pool (size = 1).
    useEffect(() => {
        setProfile(null)
        const timer = setTimeout(() => fetchProfile(false), 150)
        return () => clearTimeout(timer)
    }, [fetchProfile])

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="shrink-0 px-3 pt-3 pb-2 border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                        Data Profiler
                    </span>
                    <button
                        onClick={() => fetchProfile(true)}
                        disabled={loading || !selectedNs}
                        title="Refresh profile"
                        className="
                            w-6 h-6 flex items-center justify-center rounded
                            text-gray-400 dark:text-gray-500
                            hover:text-blue-600 dark:hover:text-blue-400
                            hover:bg-blue-50 dark:hover:bg-blue-950/40
                            disabled:opacity-30 transition-colors
                        "
                    >
                        <LuRefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>

                {/* Namespace selector */}
                {namespaces.length > 0 ? (
                    <div className="mb-1.5">
                        <label
                            htmlFor="profiler-namespace"
                            className="block text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5"
                        >
                            Connection
                        </label>
                        <select
                            id="profiler-namespace"
                            name="profiler-namespace"
                            value={selectedNs ?? ''}
                            onChange={(e) => setSelectedNs(e.target.value)}
                            className="
                                w-full text-xs font-mono rounded px-1.5 py-0.5
                                border border-gray-200 dark:border-gray-700
                                bg-white dark:bg-gray-800
                                text-gray-700 dark:text-gray-200
                                focus:outline-none focus:border-blue-400 dark:focus:border-blue-500
                                cursor-pointer
                            "
                        >
                            {namespaces.map((ns) => (
                                <option key={ns.name} value={ns.name}>
                                    {ns.name}
                                </option>
                            ))}
                        </select>
                    </div>
                ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-600 italic mb-1.5">
                        No connections
                    </p>
                )}

                {/* Table selector */}
                {tables.length > 0 && (
                    <div>
                        <label
                            htmlFor="profiler-table"
                            className="block text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-0.5"
                        >
                            Table
                        </label>
                        <select
                            id="profiler-table"
                            name="profiler-table"
                            value={selectedTable}
                            onChange={(e) => setSelectedTable(e.target.value)}
                            className="
                                w-full text-xs font-mono rounded px-1.5 py-0.5
                                border border-gray-200 dark:border-gray-700
                                bg-white dark:bg-gray-800
                                text-gray-700 dark:text-gray-200
                                focus:outline-none focus:border-blue-400 dark:focus:border-blue-500
                                cursor-pointer
                            "
                        >
                            {tables.map((t) => (
                                <option key={t} value={t}>
                                    {t}
                                </option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
                {/* Summary strip */}
                {profile && !loading && (
                    <div className="flex items-center gap-2 px-2 py-1 mb-2 rounded bg-gray-100 dark:bg-gray-800/80">
                        <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400 truncate">
                            {profile.table}
                        </span>
                        <span className="ml-auto text-[10px] tabular-nums text-gray-400 dark:text-gray-500 shrink-0">
                            {fmtNum(profile.columns[0]?.rowCount ?? 0)} rows |{' '}
                            {profile.columns.length} cols
                        </span>
                    </div>
                )}

                {loading && (
                    <div className="flex flex-col items-center justify-center py-12 gap-2">
                        <LuRefreshCw
                            size={20}
                            className="animate-spin text-blue-400 dark:text-blue-500"
                        />
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                            Profiling...
                        </span>
                    </div>
                )}

                {!loading && error && (
                    <p className="px-2 py-2 text-xs text-red-500 dark:text-red-400 break-words">
                        {error}
                    </p>
                )}

                {!loading && !error && !profile && selectedNs && (
                    <p className="px-1 py-2 text-xs text-gray-400 dark:text-gray-600 italic">
                        No data available
                    </p>
                )}

                {!loading && !error && !selectedNs && (
                    <p className="px-1 py-2 text-xs text-gray-400 dark:text-gray-600 italic">
                        Select a connection above
                    </p>
                )}

                {!loading &&
                    profile &&
                    profile.columns.map((col) => <ColumnCard key={col.name} col={col} />)}
            </div>
        </div>
    )
}
