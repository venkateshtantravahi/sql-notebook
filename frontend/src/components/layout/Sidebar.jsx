import { useState, useEffect, useRef, useCallback } from 'react'
import SchemaExplorer      from '../sidebar/SchemaExplorer.jsx'
import useSidebarStore     from '../../store/useSidebarStore.js'
import useConfigModalStore from '../../store/useConfigModalStore.js'
import useHistoryStore     from '../../store/useHistoryStore.js'
import { useNamespaceRefresh } from '../../hooks/useNamespaceRefresh.js'
import { MdEdit, MdDelete } from "react-icons/md";
import { BsThreeDots } from "react-icons/bs";
import { TbLayoutSidebarLeftExpandFilled, TbLayoutNavbarExpandFilled } from "react-icons/tb";

const MIN_WIDTH     = 180
const MAX_WIDTH     = 520
const DEFAULT_WIDTH = 288

function relativeTime(isoString) {
    const diff = Date.now() - new Date(isoString).getTime()
    const s    = Math.floor(diff / 1000)
    if (s < 60)  return `${s}s ago`
    const m = Math.floor(s / 60)
    if (m < 60)  return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24)  return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
}

function Sidebar() {
    const { isOpen }   = useSidebarStore()
    const { openEdit } = useConfigModalStore()
    const { entries: history, removeEntry, clearHistory } = useHistoryStore()

    const [namespaces,   setNamespaces]   = useState([])
    const [selectedNs,   setSelectedNs]   = useState(null)
    const [deletingNs,   setDeletingNs]   = useState(null)
    const [width,        setWidth]        = useState(DEFAULT_WIDTH)
    const [historyOpen,  setHistoryOpen]  = useState(false)

    const dragging = useRef(false)
    const startX   = useRef(0)
    const startW   = useRef(0)

    function fetchNs() {
        fetch('/namespaces')
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                const list = Array.isArray(data) && data.length > 0 && typeof data[0] === 'string'
                    ? data.map(name => ({ name, healthy: true, latencyMs: null }))
                    : data
                setNamespaces(list)
                setSelectedNs(prev => {
                    const names = list.map(n => n.name)
                    return prev && names.includes(prev) ? prev : list[0]?.name ?? null
                })
            })
            .catch(() => setNamespaces([]))
    }

    useEffect(() => {
        fetchNs()
        const interval = setInterval(fetchNs, 30000)
        return () => clearInterval(interval)
    }, [])

    useNamespaceRefresh(fetchNs)

    // drag-to-resize
    const onMouseDown = useCallback((e) => {
        dragging.current = true
        startX.current   = e.clientX
        startW.current   = width
        document.body.style.cursor     = 'col-resize'
        document.body.style.userSelect = 'none'
        e.preventDefault()
    }, [width])

    useEffect(() => {
        function onMouseMove(e) {
            if (!dragging.current) return
            const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW.current + e.clientX - startX.current))
            setWidth(next)
        }
        function onMouseUp() {
            if (!dragging.current) return
            dragging.current               = false
            document.body.style.cursor     = ''
            document.body.style.userSelect = ''
        }
        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup',   onMouseUp)
        return () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup',   onMouseUp)
        }
    }, [])

    useEffect(() => {
        document.documentElement.style.setProperty('--sidebar-width', `${width}px`)
    }, [width])

    async function handleDelete(ns) {
        if (!window.confirm(`Remove connection "${ns}"?`)) return
        setDeletingNs(ns)
        try {
            const res = await fetch(`/connections/${ns}`, { method: 'DELETE' })
            if (res.ok) window.dispatchEvent(new CustomEvent('namespace-added'))
            else        alert('Failed to remove connection')
        } catch {
            alert('Could not reach backend')
        } finally {
            setDeletingNs(null)
        }
    }

    async function handleEdit(ns) {
        try {
            const res = await fetch(`/connections/${ns}`)
            if (!res.ok) {
                alert(`Could not load config for "${ns}"`)
                return
            }
            const data = await res.json()
            openEdit({
                namespace: data.namespace,
                type:      data.type     ?? '',
                host:      data.host     ?? '',
                port:      data.port     ? String(data.port) : '',
                database:  data.database ?? '',
                username:  data.username ?? '',
            })
        } catch {
            alert('Could not reach backend')
        }
    }

    if (!isOpen) return null

    return (
        <>
            <aside
                style={{ width }}
                className="
                    fixed top-12 left-0 bottom-10
                    bg-gray-50 dark:bg-gray-900
                    border-r border-gray-200 dark:border-gray-800
                    flex flex-col overflow-hidden z-10
                "
            >
                {/* Connections */}
                <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800">
                    <div className="px-3 pt-3 pb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-amber-50">
                            Connections
                        </span>
                        <span className="text-xs tabular-nums text-gray-400 dark:text-amber-50">
                            {namespaces.length} active
                        </span>
                    </div>
                    <div className="px-2 pb-2">
                        {namespaces.length === 0 ? (
                            <p className="px-1 py-1 text-xs text-gray-400 dark:text-amber-50 italic">
                                No connections — click Config to add one
                            </p>
                        ) : (
                            namespaces.map(ns => (
                                <div
                                    key={ns.name}
                                    onClick={() => setSelectedNs(ns.name)}
                                    className={`
                                        flex items-center gap-2 px-2 py-1.5 rounded-md mb-0.5
                                        cursor-pointer group transition-colors select-none
                                        ${selectedNs === ns.name
                                        ? 'bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800'
                                        : 'border border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
                                    }
                                    `}
                                >
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                        ns.healthy === false ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'
                                    }`} />
                                    <span className={`text-xs font-mono flex-1 truncate ${
                                        selectedNs === ns.name
                                            ? 'text-blue-700 dark:text-amber-50 font-semibold'
                                            : 'text-gray-700 dark:text-amber-50'
                                    }`}>
                                        {ns.name}
                                    </span>

                                    {/*  Edit  */}
                                    <button
                                        onClick={e => { e.stopPropagation(); handleEdit(ns.name) }}
                                        title={`Edit ${ns.name}`}
                                        className="
                                            opacity-0 group-hover:opacity-100 flex-shrink-0
                                            w-6 h-6 flex items-center justify-center rounded text-xs
                                            text-gray-500 dark:text-amber-50
                                            hover:text-blue-600 dark:hover:text-white
                                            hover:bg-blue-50 dark:hover:bg-blue-950/40
                                            transition-all
                                        "
                                    >
                                        <MdEdit />
                                    </button>

                                    {/* Delete  */}
                                    <button
                                        onClick={e => { e.stopPropagation(); handleDelete(ns.name) }}
                                        disabled={deletingNs === ns.name}
                                        title={`Disconnect ${ns.name}`}
                                        className="
                                            opacity-0 group-hover:opacity-100 flex-shrink-0
                                            w-6 h-6 flex items-center justify-center rounded text-xs
                                            text-gray-500 dark:text-amber-50
                                            hover:text-red-600 dark:hover:text-red-400
                                            hover:bg-red-50 dark:hover:bg-red-950/40
                                            transition-all disabled:opacity-30
                                        "
                                    >
                                        {deletingNs === ns.name ? <BsThreeDots /> : <MdDelete /> }
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/*  Schema Explorer  */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-shrink-0 px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-amber-50">
                            Schema Explorer
                        </span>
                        {selectedNs && (
                            <span className="text-xs font-mono text-blue-500 dark:text-blue-400 truncate max-w-[55%]">
                                {selectedNs}
                            </span>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        <SchemaExplorer activeNamespace={selectedNs} />
                    </div>
                </div>

                {/* Query History */}
                <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800">
                    <button
                        onClick={() => setHistoryOpen(h => !h)}
                        className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-amber-50">
                            Query History
                        </span>
                        <div className="flex items-center gap-2">
                            {history.length > 0 && (
                                <span className="text-xs tabular-nums text-gray-400 dark:text-amber-50">
                                    {history.length}
                                </span>
                            )}
                            <span className="text-xs text-gray-400 dark:text-white">
                                {historyOpen ? <TbLayoutNavbarExpandFilled /> : <TbLayoutSidebarLeftExpandFilled />}
                            </span>
                        </div>
                    </button>

                    {historyOpen && (
                        <div className="max-h-48 overflow-y-auto">
                            {history.length === 0 ? (
                                <p className="px-3 pb-2 text-xs text-gray-400 dark:text-white italic">
                                    No queries run yet
                                </p>
                            ) : (
                                <>
                                    <div className="px-3 pb-1 flex justify-end">
                                        <button
                                            onClick={clearHistory}
                                            className="text-xs text-gray-400 dark:text-white hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                        >
                                            Clear all
                                        </button>
                                    </div>
                                    {history.map(entry => (
                                        <div
                                            key={entry.id}
                                            className="group px-3 py-1.5 flex items-start gap-2 hover:bg-gray-100 dark:hover:bg-amber-50 transition-colors"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-mono text-gray-700 dark:text-gray-200 truncate">
                                                    {entry.query}
                                                </p>
                                                <p className="text-xs text-gray-400 dark:text-gray-50 mt-0.5">
                                                    <span className="font-mono">{entry.namespace}</span>
                                                    {' · '}{entry.rowCount} rows
                                                    {' · '}{entry.duration}ms
                                                    {' · '}{relativeTime(entry.executedAt)}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => removeEntry(entry.id)}
                                                title="Remove"
                                                className="opacity-0 group-hover:opacity-100 flex-shrink-0 text-xs text-gray-500 dark:text-amber-50 hover:text-red-500 dark:hover:text-red-400 transition-all mt-0.5"
                                            >✕</button>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    )}
                </div>
            </aside>

            {/* Drag handle */}
            <div
                onMouseDown={onMouseDown}
                style={{ left: width }}
                className="fixed top-12 bottom-10 w-1 z-20 cursor-col-resize hover:bg-blue-400 dark:hover:bg-blue-500 transition-colors duration-150"
                title="Drag to resize sidebar"
            />
        </>
    )
}

export default Sidebar