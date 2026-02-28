import { useState, useEffect, useRef, useCallback } from 'react'
import SchemaExplorer from '../sidebar/SchemaExplorer.jsx'
import useSidebarStore from '../../store/useSidebarStore.js'
import { useNamespaceRefresh } from '../../hooks/useNamespaceRefresh.js'

const MIN_WIDTH     = 180
const MAX_WIDTH     = 520
const DEFAULT_WIDTH = 288 // equivalent to w-72

function Sidebar() {
    const { isOpen } = useSidebarStore()
    const [namespaces, setNamespaces] = useState([])
    const [selectedNs, setSelectedNs] = useState(null)
    const [deletingNs, setDeletingNs] = useState(null)
    const [width, setWidth]           = useState(DEFAULT_WIDTH)
    const dragging = useRef(false)
    const startX   = useRef(0)
    const startW   = useRef(0)

    function fetchNs() {
        fetch('/namespaces')
            .then(r => r.ok ? r.json() : [])
            .then(data => {
                // Normalise both string[] (old) and health object[] (new) shapes
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

    //  drag-to-resize
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
            const delta = e.clientX - startX.current
            const next  = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW.current + delta))
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

    // Publish sidebar width as a CSS variable so MainArea can offset correctly
    useEffect(() => {
        document.documentElement.style.setProperty('--sidebar-width', `${width}px`)
    }, [width])

    async function handleDelete(ns) {
        if (!window.confirm(`Remove connection "${ns}"?`)) return
        setDeletingNs(ns)
        try {
            const res = await fetch(`/connections/${ns}`, { method: 'DELETE' })
            if (res.ok) {
                window.dispatchEvent(new CustomEvent('namespace-added'))
            } else {
                alert('Failed to remove connection')
            }
        } catch {
            alert('Could not reach backend')
        } finally {
            setDeletingNs(null)
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
                {/*  Connections*/}
                <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800">
                    <div className="px-3 pt-3 pb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            Connections
                        </span>
                        <span className="text-xs tabular-nums text-gray-300 dark:text-gray-700">
                            {namespaces.length} active
                        </span>
                    </div>

                    <div className="px-2 pb-2">
                        {namespaces.length === 0 ? (
                            <p className="px-1 py-1 text-xs text-gray-400 dark:text-gray-600 italic">
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
                                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ns.healthy === false ? 'bg-red-400 animate-pulse' : 'bg-emerald-400'}`} />
                                    <span className={`
                                        text-xs font-mono flex-1 truncate
                                        ${selectedNs === ns.name
                                        ? 'text-blue-700 dark:text-blue-300 font-semibold'
                                        : 'text-gray-700 dark:text-gray-300'
                                    }
                                    `}>
                                        {ns.name}
                                    </span>
                                    {/* Delete button — visible on hover */}
                                    <button
                                        onClick={e => { e.stopPropagation(); handleDelete(ns.name) }}
                                        disabled={deletingNs === ns.name}
                                        title={`Disconnect ${ns.name}`}
                                        className="
                                            opacity-0 group-hover:opacity-100 flex-shrink-0
                                            w-4 h-4 flex items-center justify-center rounded text-xs
                                            text-gray-300 dark:text-gray-700
                                            hover:text-red-400 dark:hover:text-red-500
                                            hover:bg-red-50 dark:hover:bg-red-950/30
                                            transition-all disabled:opacity-30
                                        "
                                    >
                                        {deletingNs === ns.name ? '…' : '✕'}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Schema Explorer  */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Namespace switcher tabs — only shown when 2+ connections */}
                    {namespaces.length > 1 && (
                        <div className="flex-shrink-0 flex overflow-x-auto border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/50">
                            {namespaces.map(ns => (
                                <button
                                    key={ns.name}
                                    onClick={() => setSelectedNs(ns.name)}
                                    title={ns.name}
                                    className={`
                                        flex-shrink-0 px-3 py-2 text-xs font-mono truncate max-w-[120px]
                                        border-b-2 transition-colors
                                        ${selectedNs === ns.name
                                        ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
                                        : 'border-transparent text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'
                                    }
                                    `}
                                >
                                    {ns.name}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex-shrink-0 px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            Schema Explorer
                            {selectedNs && (
                                <span className="ml-2 normal-case font-mono text-blue-500 dark:text-blue-400">
                                    {selectedNs}
                                </span>
                            )}
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <SchemaExplorer activeNamespace={selectedNs} />
                    </div>
                </div>

                {/*  Pinned Datasets  */}
                <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800">
                    <div className="px-3 py-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            Pinned Datasets
                        </span>
                    </div>
                    <div className="px-3 pb-3">
                        <p className="text-xs text-gray-400 dark:text-gray-600 italic">No pinned datasets yet</p>
                    </div>
                </div>
            </aside>

            {/* Drag handle — 1px wide, full sidebar height  */}
            <div
                onMouseDown={onMouseDown}
                style={{ left: width }}
                className="
                    fixed top-12 bottom-10 w-1 z-20
                    cursor-col-resize
                    hover:bg-blue-400 dark:hover:bg-blue-500
                    transition-colors duration-150
                "
                title="Drag to resize sidebar"
            />
        </>
    )
}

export default Sidebar