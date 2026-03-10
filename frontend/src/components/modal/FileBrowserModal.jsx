import { MdCheckCircle, MdClose, MdChevronRight } from 'react-icons/md'
import { LuArrowUp, LuFolder, LuDatabase } from 'react-icons/lu'
import { useState, useEffect, useCallback } from 'react'

// FileBrowserModal
// Lets the user navigate the server-side filesystem and pick a .db / .sqlite file.
// Calls onSelect(absolutePath) when a file is chosen.
// Uses GET /files/browse?path= → { path, parent, entries: [{name, type, size?}] }

function formatSize(bytes) {
    if (bytes == null) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileBrowserModal({ isOpen, onSelect, onClose, initialPath }) {
    const [currentPath, setCurrentPath] = useState(initialPath || '')
    const [entries, setEntries] = useState([])
    const [parent, setParent] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [selected, setSelected] = useState(null)

    const browse = useCallback(async (path) => {
        setLoading(true)
        setError(null)
        setSelected(null)
        try {
            const url = `/files/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`
            const res = await fetch(url)
            const data = await res.json()
            if (!res.ok) {
                setError(data.error || 'Failed to browse')
                return
            }
            setCurrentPath(data.path)
            setParent(data.parent)
            setEntries(data.entries || [])
        } catch {
            setError('Could not reach backend')
        } finally {
            setLoading(false)
        }
    }, [])

    // Load initial directory when modal opens
    useEffect(() => {
        if (isOpen) browse(initialPath || '')
    }, [isOpen, initialPath, browse])

    function handleEntryClick(entry) {
        if (entry.type === 'dir') {
            browse(`${currentPath}/${entry.name}`.replace(/\/+/g, '/'))
        } else {
            // Toggle selection on file click
            const fullPath = `${currentPath}/${entry.name}`.replace(/\/+/g, '/')
            setSelected(selected === fullPath ? null : fullPath)
        }
    }

    function handleSelect() {
        if (selected) {
            onSelect(selected)
            onClose()
        }
    }

    // Breadcrumb segments from currentPath
    function buildBreadcrumbs(path) {
        if (!path) return []
        const parts = path.split('/').filter(Boolean)
        return parts.map((part, i) => ({
            label: part,
            path: '/' + parts.slice(0, i + 1).join('/'),
        }))
    }

    if (!isOpen) return null

    const breadcrumbs = buildBreadcrumbs(currentPath)

    return (
        <div className="fixed inset-0 z-60 bg-black/60 flex items-center justify-center p-4">
            <div
                className="
                w-full max-w-lg bg-white dark:bg-gray-900
                rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700
                flex flex-col
            "
                style={{ height: '480px' }}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        Browse for SQLite File
                    </span>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
                    >
                        <MdClose className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300" />
                    </button>
                </div>

                {/* Breadcrumb */}
                <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0 overflow-x-auto">
                    <button
                        onClick={() => browse('/')}
                        className="text-xs font-mono text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 shrink-0"
                    >
                        /
                    </button>
                    {breadcrumbs.map((crumb, i) => (
                        <span key={crumb.path} className="flex items-center gap-1 shrink-0">
                            <span className="text-xs text-gray-300 dark:text-gray-700">/</span>
                            <button
                                onClick={() => browse(crumb.path)}
                                className={`text-xs font-mono transition-colors ${
                                    i === breadcrumbs.length - 1
                                        ? 'text-gray-700 dark:text-gray-300 cursor-default'
                                        : 'text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300'
                                }`}
                            >
                                {crumb.label}
                            </button>
                        </span>
                    ))}
                </div>

                {/* File list */}
                <div className="flex-1 overflow-y-auto px-2 py-1">
                    {loading && (
                        <div className="flex items-center justify-center h-full">
                            <span className="text-xs text-gray-400 dark:text-gray-600 animate-pulse">
                                Loading...
                            </span>
                        </div>
                    )}

                    {error && (
                        <div className="flex items-center justify-center h-full">
                            <span className="text-xs text-red-400">{error}</span>
                        </div>
                    )}

                    {!loading && !error && (
                        <>
                            {/* Up one level */}
                            {parent && parent !== currentPath && (
                                <button
                                    onClick={() => browse(parent)}
                                    className="
                                        w-full flex items-center gap-2.5 px-3 py-1.5 rounded
                                        text-left text-xs font-mono
                                        text-gray-400 dark:text-gray-600
                                        hover:bg-gray-100 dark:hover:bg-gray-800
                                        transition-colors
                                    "
                                >
                                    <LuArrowUp size={13} />
                                    <span>.. (up one level)</span>
                                </button>
                            )}

                            {entries.length === 0 && (
                                <div className="flex items-center justify-center h-24">
                                    <span className="text-xs text-gray-300 dark:text-gray-700 italic">
                                        No .db or .sqlite files here
                                    </span>
                                </div>
                            )}

                            {entries.map((entry) => {
                                const fullPath = `${currentPath}/${entry.name}`.replace(/\/+/g, '/')
                                const isDir = entry.type === 'dir'
                                const isFile = entry.type === 'file'
                                const isSel = selected === fullPath

                                return (
                                    <button
                                        key={entry.name}
                                        onClick={() => handleEntryClick(entry)}
                                        className={`
                                            w-full flex items-center gap-2.5 px-3 py-1.5 rounded
                                            text-left text-xs font-mono transition-colors
                                            ${
                                                isSel
                                                    ? 'bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800'
                                                    : 'border border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
                                            }
                                        `}
                                    >
                                        <span className="shrink-0 flex items-center">
                                            {isDir ? (
                                                <LuFolder size={14} className="text-amber-400" />
                                            ) : (
                                                <LuDatabase size={14} className="text-blue-400" />
                                            )}
                                        </span>
                                        <span
                                            className={`flex-1 truncate ${
                                                isDir
                                                    ? 'text-gray-700 dark:text-gray-300'
                                                    : isSel
                                                      ? 'text-blue-700 dark:text-blue-300 font-semibold'
                                                      : 'text-gray-800 dark:text-gray-200'
                                            }`}
                                        >
                                            {entry.name}
                                        </span>
                                        {isFile && entry.size != null && (
                                            <span className="text-gray-300 dark:text-gray-700 shrink-0">
                                                {formatSize(entry.size)}
                                            </span>
                                        )}
                                        {isDir && (
                                            <MdChevronRight
                                                size={14}
                                                className="text-gray-300 dark:text-gray-700 shrink-0"
                                            />
                                        )}
                                    </button>
                                )
                            })}
                        </>
                    )}
                </div>

                {/* Selected path display */}
                <div className="shrink-0 px-4 py-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                    <p className="text-xs font-mono truncate text-gray-500 dark:text-gray-500">
                        {selected ? (
                            <>
                                <MdCheckCircle className="text-emerald-500 dark:text-emerald-400" />{' '}
                                {selected}
                            </>
                        ) : (
                            <span className="text-gray-300 dark:text-gray-700 italic">
                                No file selected — click a .db file above
                            </span>
                        )}
                    </p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-800 shrink-0">
                    <button
                        onClick={onClose}
                        className="text-xs px-4 py-2 rounded transition-colors text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSelect}
                        disabled={!selected}
                        className="text-xs px-4 py-2 rounded transition-colors bg-blue-600 hover:bg-blue-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        Select File
                    </button>
                </div>
            </div>
        </div>
    )
}

export default FileBrowserModal
