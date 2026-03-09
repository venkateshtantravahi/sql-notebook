import { useState, useEffect, useRef, useCallback } from 'react'
import SchemaExplorer from '../sidebar/SchemaExplorer.jsx'
import useSidebarStore from '../../store/useSidebarStore.js'
import useConfigModalStore from '../../store/useConfigModalStore.js'
import { useNamespaceRefresh } from '../../hooks/useNamespaceRefresh.js'
import { MdEdit, MdDelete, MdOutlineCancel } from 'react-icons/md'
import { BsFiletypeJson, BsFiletypeXlsx, BsThreeDots } from 'react-icons/bs'
import { IoGlobeOutline } from 'react-icons/io5'
import { TbFileArrowRight, TbFileDatabase, TbFileTypeCsv } from 'react-icons/tb'
import { FaRegFileAlt, FaRegFolderOpen } from 'react-icons/fa'
import { LuFileJson } from 'react-icons/lu'
import { SiApacheparquet } from 'react-icons/si'

const MIN_WIDTH = 180
const MAX_WIDTH = 520
const DEFAULT_WIDTH = 288

function sourceIcon(kind, filename) {
    if (kind === 'remote') return <IoGlobeOutline className="text-blue-500 dark:text-blue-400" />
    const ext = filename?.split('.').pop()?.toLowerCase()
    const icons = {
        csv: <TbFileTypeCsv className="text-green-600 dark:text-green-400" />,
        tsv: <FaRegFileAlt className="text-gray-500 dark:text-gray-400" />,
        json: <BsFiletypeJson className="text-yellow-600 dark:text-yellow-400" />,
        ndjson: <LuFileJson className="text-yellow-600 dark:text-yellow-400" />,
        parquet: <SiApacheparquet className="text-purple-600 dark:text-purple-400" />,
        arrow: <TbFileArrowRight className="text-orange-500 dark:text-orange-400" />,
        xlsx: <BsFiletypeXlsx className="text-emerald-600 dark:text-emerald-400" />,
        xls: <BsFiletypeXlsx className="text-emerald-600 dark:text-emerald-400" />,
        db: <TbFileDatabase className="text-blue-600 dark:text-blue-400" />,
    }
    return icons[ext] ?? <FaRegFolderOpen className="text-gray-500 dark:text-gray-400" />
}

function DataSourcesSection() {
    const [sources, setSources] = useState([])
    const [deletingNs, setDeletingNs] = useState(null)

    function fetchSources() {
        fetch('/sources')
            .then((r) => (r.ok ? r.json() : { sources: [] }))
            .then((data) => {
                // backend returns { sources: [...] }
                const list = Array.isArray(data) ? data : (data.sources ?? [])
                setSources(list)
            })
            .catch(() => setSources([]))
    }

    useEffect(() => {
        fetchSources()
    }, [])

    useEffect(() => {
        const handler = () => fetchSources()
        window.addEventListener('namespace-added', handler)
        return () => window.removeEventListener('namespace-added', handler)
    }, [])

    async function handleDelete(namespace, e) {
        e.stopPropagation()
        if (
            !window.confirm(
                `Remove data source "${namespace}"?\nThis will delete the uploaded file.`
            )
        )
            return
        setDeletingNs(namespace)
        try {
            const res = await fetch(`/sources/${namespace}`, { method: 'DELETE' })
            if (res.ok) {
                setSources((prev) => prev.filter((s) => s.namespace !== namespace))
                window.dispatchEvent(new CustomEvent('namespace-added'))
            } else {
                alert('Failed to remove data source')
            }
        } catch {
            alert('Could not reach backend')
        } finally {
            setDeletingNs(null)
        }
    }

    return (
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-800">
            <div className="px-3 pt-3 pb-1 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Data Sources
                </span>
                <span className="text-xs tabular-nums text-gray-300 dark:text-gray-700">
                    {sources.length > 0 ? sources.length : ''}
                </span>
            </div>
            <div className="px-2 pb-2">
                {sources.length === 0 ? (
                    <p className="px-1 py-1 text-xs text-gray-400 dark:text-gray-600 italic">
                        No data sources — use File → Add Data Source
                    </p>
                ) : (
                    sources.map((src) => (
                        <div
                            key={src.namespace}
                            className="flex items-center gap-2 px-2 py-1.5 rounded-md mb-0.5 group border border-transparent hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors select-none"
                        >
                            <span className="text-sm shrink-0 leading-none">
                                {sourceIcon(src.kind, src.filename ?? src.url)}
                            </span>
                            <div className="flex-1 min-w-0">
                                <span className="block text-xs font-mono truncate text-gray-700 dark:text-gray-300">
                                    {src.namespace}
                                </span>
                                {(src.filename || src.url) && (
                                    <span
                                        className="block text-xs truncate text-gray-400 dark:text-gray-600"
                                        title={src.filename ?? src.url}
                                    >
                                        {src.filename ?? src.url}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={(e) => handleDelete(src.namespace, e)}
                                disabled={deletingNs === src.namespace}
                                title={`Remove ${src.namespace}`}
                                className="opacity-0 group-hover:opacity-100 shrink-0 w-4 h-4 flex items-center justify-center rounded text-xs text-gray-300 dark:text-gray-700 hover:text-red-400 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all disabled:opacity-30"
                            >
                                {deletingNs === src.namespace ? (
                                    <BsThreeDots className="text-gray-400 dark:text-gray-500" />
                                ) : (
                                    <MdOutlineCancel className="text-gray-400 dark:text-white hover:text-red-800" />
                                )}
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

function Sidebar() {
    const { isOpen } = useSidebarStore()
    // const { openEdit } = useConfigModalStore()

    const configStore = useConfigModalStore()
    const openEdit = configStore.openEdit ?? configStore.open ?? (() => {})

    const [namespaces, setNamespaces] = useState([])
    const [selectedNs, setSelectedNs] = useState(null)
    const [deletingNs, setDeletingNs] = useState(null)
    const [width, setWidth] = useState(DEFAULT_WIDTH)

    const dragging = useRef(false)
    const startX = useRef(0)
    const startW = useRef(0)

    function fetchNs() {
        fetch('/namespaces')
            .then((r) => (r.ok ? r.json() : []))
            .then((data) => {
                const list =
                    Array.isArray(data) && data.length > 0 && typeof data[0] === 'string'
                        ? data.map((name) => ({ name, healthy: true, latencyMs: null }))
                        : data
                setNamespaces(list)
                setSelectedNs((prev) => {
                    const names = list.map((n) => n.name)
                    return prev && names.includes(prev) ? prev : (list[0]?.name ?? null)
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
    const onMouseDown = useCallback(
        (e) => {
            dragging.current = true
            startX.current = e.clientX
            startW.current = width
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
            e.preventDefault()
        },
        [width]
    )

    useEffect(() => {
        function onMouseMove(e) {
            if (!dragging.current) return
            const next = Math.min(
                MAX_WIDTH,
                Math.max(MIN_WIDTH, startW.current + e.clientX - startX.current)
            )
            setWidth(next)
        }
        function onMouseUp() {
            if (!dragging.current) return
            dragging.current = false
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
        }
        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
        return () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
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
            else alert('Failed to remove connection')
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
                type: data.type ?? '',
                host: data.host ?? '',
                port: data.port ? String(data.port) : '',
                database: data.database ?? '',
                username: data.username ?? '',
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
                <div className="shrink-0 border-b border-gray-200 dark:border-gray-800">
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
                            namespaces.map((ns) => (
                                <div
                                    key={ns.name}
                                    onClick={() => setSelectedNs(ns.name)}
                                    className={`
                                        flex items-center gap-2 px-2 py-1.5 rounded-md mb-0.5
                                        cursor-pointer group transition-colors select-none
                                        ${
                                            selectedNs === ns.name
                                                ? 'bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800'
                                                : 'border border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
                                        }
                                    `}
                                >
                                    <div
                                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                            ns.healthy === false
                                                ? 'bg-red-400 animate-pulse'
                                                : 'bg-emerald-400'
                                        }`}
                                    />
                                    <span
                                        className={`text-xs font-mono flex-1 truncate ${
                                            selectedNs === ns.name
                                                ? 'text-blue-700 dark:text-amber-50 font-semibold'
                                                : 'text-gray-700 dark:text-amber-50'
                                        }`}
                                    >
                                        {ns.name}
                                    </span>

                                    {/*  Edit  */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleEdit(ns.name)
                                        }}
                                        title={`Edit ${ns.name}`}
                                        className="
                                            opacity-0 group-hover:opacity-100 shrink-0
                                            w-6 h-6 flex items-center justify-center rounded text-xs
                                            text-gray-500 dark:text-amber-50
                                            hover:text-blue-600 dark:hover:text-white
                                            hover:bg-blue-50 dark:hover:bg-blue-950/40
                                            transition-all
                                        "
                                    >
                                        <MdEdit className="text-gray-500 dark:text-gray-400" />
                                    </button>

                                    {/* Delete  */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            handleDelete(ns.name)
                                        }}
                                        disabled={deletingNs === ns.name}
                                        title={`Disconnect ${ns.name}`}
                                        className="
                                            opacity-0 group-hover:opacity-100 shrink-0
                                            w-6 h-6 flex items-center justify-center rounded text-xs
                                            text-gray-500 dark:text-amber-50
                                            hover:text-red-600 dark:hover:text-red-400
                                            hover:bg-red-50 dark:hover:bg-red-950/40
                                            transition-all disabled:opacity-30
                                        "
                                    >
                                        {deletingNs === ns.name ? (
                                            <BsThreeDots className="text-gray-400 dark:text-gray-500" />
                                        ) : (
                                            <MdDelete className="text-gray-500 dark:text-gray-400" />
                                        )}
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/*  Schema Explorer  */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="shrink-0 px-3 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
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
                {/* Data Sources */}
                <DataSourcesSection />
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
