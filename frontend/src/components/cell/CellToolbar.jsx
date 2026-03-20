import { MdPlayArrow, MdClose, MdDownload } from 'react-icons/md'
import { LuPin, LuPinOff, LuCheck, LuZap } from 'react-icons/lu'
import { CgSpinner } from 'react-icons/cg'
import { useState, useRef, useEffect } from 'react'
import useZoomStore from '../../store/useZoomStore.js'
import { exportCSV, exportJSON } from '../../utils/exportUtils.js'

/**
 * Detects whether the SQL references >=2 registered namespaces using `word.` prefix
 * matching. When true, the toolbar shows a "Federated" badge instead of the
 * namespace dropdown and allows the query to run without a selected namespace.
 */
function detectFederatedNamespaces(sql, registeredNamespaces) {
    if (!sql || registeredNamespaces.length === 0) return new Set()
    const pattern = /\b([a-zA-Z_][a-zA-Z0-9_]*)\./g
    const found = new Set()
    let m
    while ((m = pattern.exec(sql)) !== null) {
        if (registeredNamespaces.includes(m[1])) found.add(m[1])
    }
    return found
}

function PinForm({ results, onPinned, cellId }) {
    const [open, setOpen] = useState(false)
    const [name, setName] = useState('')
    const [status, setStatus] = useState(null) // null | 'pinning' | 'done' | 'error'
    const [errorMsg, setErrorMsg] = useState('')
    const inputRef = useRef(null)

    useEffect(() => {
        if (open) inputRef.current?.focus()
    }, [open])

    async function handlePin(e) {
        e.preventDefault()
        const trimmed = name.trim()
        if (!trimmed) return

        setStatus('pinning')
        setErrorMsg('')

        try {
            const res = await fetch('/pin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: trimmed,
                    columns: results.columns,
                    rows: results.rows,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                setStatus('error')
                setErrorMsg(data.error ?? 'Pin failed')
                return
            }
            setStatus('done')
            // Notify all namespace lists to refresh
            window.dispatchEvent(new Event('namespace-added'))
            onPinned?.(data.namespace)
            // Reset form after a brief success flash
            setTimeout(() => {
                setOpen(false)
                setName('')
                setStatus(null)
            }, 1400)
        } catch (err) {
            setStatus('error')
            setErrorMsg(err.message)
        }
    }

    if (!open) {
        return (
            <button
                onClick={() => setOpen(true)}
                title="Pin as dataset"
                className="
                    text-xs px-2 py-1 rounded font-mono flex items-center gap-1
                    text-violet-600 dark:text-violet-400
                    hover:bg-violet-50 dark:hover:bg-violet-900/20
                    transition-colors
                "
            >
                <LuPin size={12} /> Pin
            </button>
        )
    }

    const inputId = `pin-name-${cellId}`

    return (
        <form onSubmit={handlePin} className="flex items-center gap-1">
            <input
                ref={inputRef}
                id={inputId}
                name="pin-dataset-name"
                aria-label="Dataset name for pinned query"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
                placeholder="dataset name"
                disabled={status === 'pinning' || status === 'done'}
                className="
                    text-xs font-mono px-2 py-1 rounded w-32
                    bg-white dark:bg-gray-700
                    border border-violet-300 dark:border-violet-600
                    text-gray-700 dark:text-gray-200
                    placeholder:text-gray-400 dark:placeholder:text-gray-500
                    focus:outline-none focus:ring-1 focus:ring-violet-400
                    disabled:opacity-50
                "
            />
            <button
                type="submit"
                disabled={!name.trim() || status === 'pinning' || status === 'done'}
                className="
                    text-xs px-2 py-1 rounded font-mono flex items-center gap-1
                    bg-violet-600 hover:bg-violet-500 text-white
                    disabled:opacity-40 disabled:cursor-not-allowed
                    transition-colors
                "
            >
                {status === 'pinning' ? (
                    <CgSpinner className="animate-spin" />
                ) : status === 'done' ? (
                    <LuCheck size={12} />
                ) : (
                    <LuPin size={11} />
                )}
            </button>
            <button
                type="button"
                onClick={() => {
                    setOpen(false)
                    setStatus(null)
                    setErrorMsg('')
                }}
                className="
                    text-xs px-1 py-1 rounded
                    text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
                    transition-colors
                "
            >
                <LuPinOff size={12} />
            </button>
            {status === 'error' && (
                <span className="text-xs text-red-500 font-mono truncate max-w-36" title={errorMsg}>
                    {errorMsg}
                </span>
            )}
        </form>
    )
}

function CellToolbar({ cell, namespaces = [], onRun, onDelete, onNamespaceChange }) {
    const { level } = useZoomStore()
    const isRunning = cell.status === 'running'
    const hasResults = cell.status === 'done' && cell.results

    const federatedNs = detectFederatedNamespaces(cell.source, namespaces)
    const isFederated = federatedNs.size >= 2

    // While the fetch is pending, the cell's saved namespace may not be in the list yet.
    // Add it as a fallback so the select shows the correct value immediately on load.
    const visibleNamespaces =
        cell.namespace && !namespaces.includes(cell.namespace)
            ? [cell.namespace, ...namespaces]
            : namespaces

    return (
        <div
            style={{ fontSize: `${level}em` }}
            className="
        flex items-center justify-between
        px-3 py-2
        border-b border-gray-200 dark:border-gray-700
        bg-gray-50 dark:bg-[#1a2540]
        rounded-t-lg
      "
        >
            {/* Left  -  federated badge or namespace dropdown */}
            {isFederated ? (
                <div className="flex items-center gap-1.5">
                    <span
                        className="
              text-xs font-mono px-2 py-1 rounded
              bg-violet-100 dark:bg-violet-900/40
              text-violet-700 dark:text-violet-300
              border border-violet-300 dark:border-violet-700
            "
                        title={`Federated across: ${[...federatedNs].join(', ')}`}
                    >
                        <LuZap size={11} className="inline mr-0.5" /> Federated
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                        {[...federatedNs].join(' x ')}
                    </span>
                </div>
            ) : (
                <select
                    id={`namespace-${cell.id}`}
                    name={`namespace-${cell.id}`}
                    value={cell.namespace ?? ''}
                    onChange={(e) => onNamespaceChange(e.target.value)}
                    className="
            text-xs font-mono px-2 py-1 rounded
            bg-white dark:bg-gray-700
            border border-gray-200 dark:border-gray-600
            text-gray-700 dark:text-gray-300
            focus:outline-none focus:ring-2 focus:ring-blue-500
            transition-colors
          "
                >
                    <option value="" disabled>
                        {visibleNamespaces.length === 0
                            ? 'No namespaces -- click Config'
                            : 'Select namespace'}
                    </option>
                    {visibleNamespaces.map((ns) => (
                        <option key={ns} value={ns}>
                            {ns}
                        </option>
                    ))}
                </select>
            )}

            {/* Right  -  export + pin + run + delete */}
            <div className="flex items-center gap-2">
                {hasResults && (
                    <div className="flex items-center gap-1 mr-1">
                        <button
                            onClick={() => exportCSV(cell.results)}
                            className="
                text-xs px-2 py-1 rounded font-mono
                text-gray-500 dark:text-gray-400
                hover:bg-gray-200 dark:hover:bg-gray-700
                hover:text-gray-700 dark:hover:text-gray-200
                transition-colors
              "
                            title="Export as CSV"
                        >
                            <MdDownload className="inline" /> CSV
                        </button>
                        <button
                            onClick={() => exportJSON(cell.results)}
                            className="
                text-xs px-2 py-1 rounded font-mono
                text-gray-500 dark:text-gray-400
                hover:bg-gray-200 dark:hover:bg-gray-700
                hover:text-gray-700 dark:hover:text-gray-200
                transition-colors
              "
                            title="Export as JSON"
                        >
                            <MdDownload className="inline" /> JSON
                        </button>
                        {isFederated && (
                            <>
                                <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-0.5" />
                                <PinForm results={cell.results} cellId={cell.id} />
                            </>
                        )}
                    </div>
                )}

                <button
                    onClick={onRun}
                    disabled={isRunning || (!isFederated && !cell.namespace)}
                    className="
            flex items-center gap-1.5
            text-xs px-3 py-1 rounded
            bg-blue-600 hover:bg-blue-500
            disabled:opacity-40 disabled:cursor-not-allowed
            text-white font-medium transition-colors
          "
                >
                    {isRunning ? (
                        <>
                            <CgSpinner className="animate-spin text-white" /> Running
                        </>
                    ) : (
                        <>
                            <MdPlayArrow className="text-white" /> Run
                        </>
                    )}
                </button>

                <button
                    onClick={onDelete}
                    className="
            text-xs px-2 py-1 rounded
            text-gray-400 dark:text-gray-500
            hover:bg-red-50 dark:hover:bg-red-900/20
            hover:text-red-500 dark:hover:text-red-400
            transition-colors
          "
                >
                    <MdClose className="text-gray-400 dark:text-gray-500 hover:text-red-400 dark:hover:text-red-400" />
                </button>
            </div>
        </div>
    )
}

export default CellToolbar
