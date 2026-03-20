import { useState, useEffect, useRef, useCallback } from 'react'
import useCellStore from '../../store/useCellStore.js'
import useNotebookStore from '../../store/useNotebookStore.js'
import { useBackendReady } from '../../hooks/useBackendReady.js'
import { flushAutosave } from '../../lib/autosave.js'
import { clearFileHandle } from '../../lib/fileHandleStore.js'
import {
    LuPlus,
    LuCheck,
    LuX,
    LuRefreshCw,
    LuChevronLeft,
    LuChevronRight,
    LuFolder,
    LuLoader,
} from 'react-icons/lu'
import { MdOutlineCancel } from 'react-icons/md'
import { BsThreeDots } from 'react-icons/bs'
import { TbFileTypeCsv, TbFileDatabase, TbFileArrowRight } from 'react-icons/tb'
import { BsFiletypeJson, BsFiletypeXlsx } from 'react-icons/bs'
import { LuFileJson } from 'react-icons/lu'
import { SiApacheparquet } from 'react-icons/si'
import { FaRegFileAlt } from 'react-icons/fa'

// File icon by extension

function FileIcon({ name }) {
    const ext = name?.split('.').pop()?.toLowerCase()
    const cls = 'shrink-0'
    switch (ext) {
        case 'sqlnb':
            return <FaRegFileAlt className={`${cls} text-blue-500 dark:text-blue-400`} />
        case 'csv':
        case 'tsv':
            return <TbFileTypeCsv className={`${cls} text-green-600 dark:text-green-400`} />
        case 'json':
            return <BsFiletypeJson className={`${cls} text-yellow-600 dark:text-yellow-400`} />
        case 'ndjson':
            return <LuFileJson className={`${cls} text-yellow-600 dark:text-yellow-400`} />
        case 'parquet':
            return <SiApacheparquet className={`${cls} text-purple-600 dark:text-purple-400`} />
        case 'arrow':
            return <TbFileArrowRight className={`${cls} text-orange-500 dark:text-orange-400`} />
        case 'xlsx':
        case 'xls':
            return <BsFiletypeXlsx className={`${cls} text-emerald-600 dark:text-emerald-400`} />
        case 'db':
        case 'sqlite':
        case 'sqlite3':
            return <TbFileDatabase className={`${cls} text-blue-600 dark:text-blue-400`} />
        default:
            return <FaRegFileAlt className={`${cls} text-gray-400 dark:text-gray-500`} />
    }
}

// Relative time helper

function relativeTime(ms) {
    const diff = Date.now() - ms
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return `${Math.floor(diff / 86_400_000)}d ago`
}

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Context menu

function ContextMenu({ x, y, file, onOpen, onRename, onDelete, onClose }) {
    const ref = useRef(null)

    useEffect(() => {
        function handle(e) {
            if (ref.current && !ref.current.contains(e.target)) onClose()
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [onClose])

    const isNotebook = file?.name?.endsWith('.sqlnb')

    return (
        <div
            ref={ref}
            style={{ top: y, left: x }}
            className="
                fixed z-50 min-w-36 py-1 rounded-md shadow-lg
                bg-white dark:bg-gray-800
                border border-gray-200 dark:border-gray-700
                text-xs
            "
        >
            {isNotebook && (
                <button
                    onClick={() => {
                        onOpen(file)
                        onClose()
                    }}
                    className="w-full text-left px-3 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                    Open
                </button>
            )}
            {isNotebook && (
                <button
                    onClick={() => {
                        onRename(file)
                        onClose()
                    }}
                    className="w-full text-left px-3 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                    Rename
                </button>
            )}
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            <button
                onClick={() => {
                    onDelete(file)
                    onClose()
                }}
                className="w-full text-left px-3 py-1.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
                Delete
            </button>
        </div>
    )
}

// Inline name input (new file or rename)

function InlineInput({ initialValue, placeholder, onCommit, onCancel }) {
    const [value, setValue] = useState(initialValue)
    const inputRef = useRef(null)

    useEffect(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
    }, [])

    function commit() {
        const trimmed = value.trim()
        if (trimmed) onCommit(trimmed)
        else onCancel()
    }

    return (
        <div className="flex items-center gap-1 px-2 py-1">
            <input
                ref={inputRef}
                id="workspace-rename-input"
                name="workspace-item-name"
                aria-label={placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') commit()
                    if (e.key === 'Escape') onCancel()
                }}
                placeholder={placeholder}
                className="
                    flex-1 min-w-0 text-xs font-mono
                    bg-transparent border-b border-blue-400 dark:border-blue-500
                    text-gray-800 dark:text-gray-100
                    focus:outline-none py-0.5
                "
            />
            <button
                onClick={commit}
                title="Confirm"
                className="text-emerald-500 hover:text-emerald-400"
            >
                <LuCheck size={12} />
            </button>
            <button
                onClick={onCancel}
                title="Cancel"
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
                <LuX size={12} />
            </button>
        </div>
    )
}

// Currently-open notebook strip
// Shows which file is active and its live save status so the user always
// knows exactly what is open and where it lives on disk.

function CurrentlyOpenStrip({ onClose }) {
    const workspaceFile = useNotebookStore((s) => s.workspaceFile)
    const isSaving = useNotebookStore((s) => s.isSaving)
    const savedAt = useNotebookStore((s) => s.savedAt)
    const [showSaved, setShowSaved] = useState(false)
    const prevSavedAt = useRef(null)

    useEffect(() => {
        if (!savedAt || savedAt === prevSavedAt.current) return
        prevSavedAt.current = savedAt
        setShowSaved(true)
        const t = setTimeout(() => setShowSaved(false), 3000)
        return () => clearTimeout(t)
    }, [savedAt])

    if (!workspaceFile) return null

    const fileName = workspaceFile.split('/').pop()
    const dirPath = workspaceFile.includes('/')
        ? workspaceFile.slice(0, workspaceFile.lastIndexOf('/'))
        : null

    return (
        <div className="shrink-0 mx-2 mb-2 px-2.5 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60">
            {/* File name row */}
            <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                <span
                    className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-300 truncate flex-1 min-w-0"
                    title={workspaceFile}
                >
                    {fileName}
                </span>
                <button
                    onClick={onClose}
                    title="Close notebook"
                    className="shrink-0 w-4 h-4 flex items-center justify-center rounded text-blue-300 dark:text-blue-700 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                >
                    <LuX size={10} />
                </button>
            </div>

            {/* Directory path row */}
            {dirPath && (
                <div
                    className="mt-0.5 ml-3 text-xs font-mono text-blue-400 dark:text-blue-600 truncate"
                    title={workspaceFile}
                >
                    {dirPath}/
                </div>
            )}

            {/* Save status row */}
            <div className="mt-1 ml-3 text-xs flex items-center gap-1">
                {isSaving ? (
                    <>
                        <LuLoader
                            size={10}
                            className="text-gray-400 dark:text-gray-500 animate-spin"
                        />
                        <span className="text-gray-400 dark:text-gray-500">Saving...</span>
                    </>
                ) : showSaved ? (
                    <>
                        <LuCheck size={10} className="text-emerald-500 dark:text-emerald-400" />
                        <span className="text-emerald-500 dark:text-emerald-400">Auto-saved</span>
                    </>
                ) : (
                    <span className="text-blue-300 dark:text-blue-700">Saved to workspace</span>
                )}
            </div>
        </div>
    )
}

// Main panel

export default function WorkspacePanel() {
    const [files, setFiles] = useState([])
    const [workspacePath, setWorkspacePath] = useState('')
    const [currentDir, setCurrentDir] = useState('') // relative path from root, '' = root
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [renamingFile, setRenamingFile] = useState(null)
    const [busyFile, setBusyFile] = useState(null)
    const [contextMenu, setContextMenu] = useState(null)

    const { loadSnapshot, clearCells } = useCellStore()
    const { setWorkspaceFile, setTitle, newNotebook } = useNotebookStore()
    const backendReady = useBackendReady()

    // Reset to a blank untitled notebook - used by close button and delete-while-open
    function closeNotebook() {
        clearFileHandle()
        clearCells()
        newNotebook()
    }

    // Build query string with optional dir param
    function dirQuery(base) {
        return currentDir ? `${base}?dir=${encodeURIComponent(currentDir)}` : base
    }

    // Fetch file list

    const fetchFiles = useCallback(() => {
        fetch(dirQuery('/workspace'))
            .then((r) => (r.ok ? r.json() : { files: [], path: '', relPath: '' }))
            .then((data) => {
                setFiles(data.files ?? [])
                setWorkspacePath(data.path ?? '')
            })
            .catch(() => {})
            .finally(() => setLoading(false))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDir])

    // Gate on backendReady  -  WorkspacePanel is the default open panel so it
    // mounts during the splash screen. Without this guard it would fire a 5s
    // polling loop before the JVM is ready.
    useEffect(() => {
        if (!backendReady) return
        setLoading(true)
        fetchFiles()
        const id = setInterval(fetchFiles, 5000)
        return () => clearInterval(id)
    }, [fetchFiles, backendReady])

    // Navigate into a subdirectory

    function enterDir(name) {
        setCurrentDir((prev) => (prev ? `${prev}/${name}` : name))
        setCreating(false)
    }

    // Navigate up one level

    function goUp() {
        setCurrentDir((prev) => {
            const parts = prev.split('/').filter(Boolean)
            parts.pop()
            return parts.join('/')
        })
        setCreating(false)
    }

    // Open a .sqlnb file

    async function openNotebook(file) {
        // Flush any pending autosave for the current notebook before switching --
        // no confirm dialog needed since autosave keeps things current.
        await flushAutosave()
        try {
            const url = currentDir
                ? `/workspace/read?name=${encodeURIComponent(file.name)}&dir=${encodeURIComponent(currentDir)}`
                : `/workspace/read?name=${encodeURIComponent(file.name)}`
            const res = await fetch(url)
            if (!res.ok) {
                alert(`Could not read "${file.name}"`)
                return
            }
            const data = await res.json()
            clearFileHandle() // clear any File System Access API handle from previous session
            useNotebookStore.getState().restoreMetadata(data)
            loadSnapshot(data.cells ?? [])
            const wsName = currentDir ? `${currentDir}/${file.name}` : file.name
            setWorkspaceFile(wsName)
        } catch {
            alert('Failed to open file')
        }
    }

    // Create a new .sqlnb file

    async function handleCreate(name) {
        setCreating(false)
        const finalName = name.endsWith('.sqlnb') ? name : name + '.sqlnb'
        try {
            const url = dirQuery('/workspace')
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: finalName }),
            })
            if (res.status === 409) {
                alert(`"${finalName}" already exists`)
                return
            }
            if (!res.ok) {
                alert('Failed to create file')
                return
            }
            const data = await res.json()
            fetchFiles()
            await openNotebook({ name: data.name })
        } catch {
            alert('Failed to create file')
        }
    }

    // Rename a .sqlnb file

    async function handleRename(file, newName) {
        setRenamingFile(null)
        const finalName = newName.endsWith('.sqlnb') ? newName : newName + '.sqlnb'
        if (finalName === file.name) return
        try {
            const res = await fetch('/workspace/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    from: file.name,
                    to: finalName,
                    dir: currentDir || undefined,
                }),
            })
            if (res.status === 409) {
                alert(`"${finalName}" already exists`)
                return
            }
            if (!res.ok) {
                alert('Rename failed')
                return
            }
            const oldWsName = currentDir ? `${currentDir}/${file.name}` : file.name
            const newWsName = currentDir ? `${currentDir}/${finalName}` : finalName
            const current = useNotebookStore.getState().workspaceFile
            if (current === oldWsName) {
                setWorkspaceFile(newWsName)
                setTitle(finalName.replace('.sqlnb', '').replace(/-|_/g, ' '))
            }
            fetchFiles()
        } catch {
            alert('Failed to rename file')
        }
    }

    // Delete a file

    async function handleDelete(file) {
        if (!window.confirm(`Delete "${file.name}"? This cannot be undone.`)) return
        setBusyFile(file.name)
        try {
            const url = currentDir
                ? `/workspace?name=${encodeURIComponent(file.name)}&dir=${encodeURIComponent(currentDir)}`
                : `/workspace?name=${encodeURIComponent(file.name)}`
            const res = await fetch(url, { method: 'DELETE' })
            if (!res.ok) {
                alert('Delete failed')
                return
            }
            const wsName = currentDir ? `${currentDir}/${file.name}` : file.name
            if (useNotebookStore.getState().workspaceFile === wsName) {
                closeNotebook()
            }
            fetchFiles()
        } catch {
            alert('Failed to delete file')
        } finally {
            setBusyFile(null)
        }
    }

    // Context menu

    function handleContextMenu(e, file) {
        e.preventDefault()
        setContextMenu({ x: e.clientX, y: e.clientY, file })
    }

    // Breadcrumb: root folder name derived from the full workspace path reported
    // by the backend.  Falls back to the raw path if splitting gives nothing
    // (e.g. when running from "/").
    const rootName = workspacePath
        ? workspacePath.split('/').filter(Boolean).pop() || workspacePath
        : '...'
    const dirParts = currentDir ? currentDir.split('/').filter(Boolean) : []
    const isInSubdir = dirParts.length > 0

    // Render

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="shrink-0 px-3 pt-3 pb-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-800">
                <div className="flex items-center gap-1 min-w-0 flex-1">
                    {isInSubdir && (
                        <button
                            onClick={goUp}
                            title="Go up"
                            className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                        >
                            <LuChevronLeft size={12} />
                        </button>
                    )}
                    <div className="flex flex-col min-w-0">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                            Workspace
                        </span>
                        {/* Breadcrumb */}
                        <div
                            className="flex items-center gap-0.5 text-xs text-gray-400 dark:text-gray-600 font-mono truncate"
                            title={workspacePath + (currentDir ? '/' + currentDir : '')}
                        >
                            <span
                                className={isInSubdir ? 'cursor-pointer hover:text-blue-400' : ''}
                                onClick={() => isInSubdir && setCurrentDir('')}
                            >
                                {rootName}
                            </span>
                            {dirParts.map((part, i) => (
                                <span key={i} className="flex items-center gap-0.5">
                                    <LuChevronRight size={10} className="shrink-0" />
                                    <span
                                        className={
                                            i < dirParts.length - 1
                                                ? 'cursor-pointer hover:text-blue-400'
                                                : 'text-blue-500 dark:text-blue-400'
                                        }
                                        onClick={() => {
                                            if (i < dirParts.length - 1) {
                                                setCurrentDir(dirParts.slice(0, i + 1).join('/'))
                                            }
                                        }}
                                    >
                                        {part}
                                    </span>
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={fetchFiles}
                        title="Refresh"
                        className="w-5 h-5 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                    >
                        <LuRefreshCw size={11} />
                    </button>
                    <button
                        onClick={() => setCreating(true)}
                        title={`New notebook in ${currentDir ? currentDir + '/' : rootName + '/'}`}
                        className="w-5 h-5 flex items-center justify-center rounded text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors"
                    >
                        <LuPlus size={12} />
                    </button>
                </div>
            </div>

            {/* Currently open notebook -- always visible when a workspace file is active */}
            <CurrentlyOpenStrip onClose={closeNotebook} />

            {/* File list */}
            <div className="flex-1 overflow-y-auto px-2 py-2">
                {/* Inline new-file input */}
                {creating && (
                    <InlineInput
                        initialValue="new-notebook.sqlnb"
                        placeholder="notebook-name.sqlnb"
                        onCommit={handleCreate}
                        onCancel={() => setCreating(false)}
                    />
                )}

                {loading && !creating && (
                    <p className="px-2 py-1 text-xs text-gray-400 dark:text-gray-600 italic">
                        Loading...
                    </p>
                )}

                {!loading && files.length === 0 && !creating && (
                    <p className="px-1 py-1 text-xs text-gray-400 dark:text-gray-600 italic">
                        {isInSubdir
                            ? 'Empty directory'
                            : 'No notebooks here -- click + to create one'}
                    </p>
                )}

                {files.map((entry) => {
                    const isDir = entry.type === 'dir'
                    const isNotebook = !isDir && entry.name.endsWith('.sqlnb')
                    const wsName = currentDir ? `${currentDir}/${entry.name}` : entry.name
                    const isOpen = !isDir && useNotebookStore.getState().workspaceFile === wsName
                    const isRenaming = renamingFile?.name === entry.name
                    const isBusy = busyFile === entry.name

                    if (isRenaming) {
                        return (
                            <InlineInput
                                key={entry.name}
                                initialValue={entry.name}
                                placeholder={entry.name}
                                onCommit={(val) => handleRename(entry, val)}
                                onCancel={() => setRenamingFile(null)}
                            />
                        )
                    }

                    return (
                        <div
                            key={entry.name}
                            onClick={() => {
                                if (isDir) enterDir(entry.name)
                                else if (isNotebook) openNotebook(entry)
                            }}
                            onContextMenu={(e) => !isDir && handleContextMenu(e, entry)}
                            className={`
                                flex items-center gap-2 px-2 py-1.5 rounded-md mb-0.5
                                group border transition-colors select-none cursor-pointer
                                ${
                                    isOpen
                                        ? 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800'
                                        : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-800'
                                }
                            `}
                        >
                            <span className="text-sm leading-none">
                                {isDir ? (
                                    <LuFolder className="shrink-0 text-yellow-500 dark:text-yellow-400" />
                                ) : (
                                    <FileIcon name={entry.name} />
                                )}
                            </span>

                            <div className="flex-1 min-w-0">
                                <span
                                    className={`
                                    block text-xs font-mono truncate
                                    ${
                                        isDir
                                            ? 'text-gray-700 dark:text-gray-200'
                                            : isOpen
                                              ? 'text-blue-700 dark:text-blue-300 font-semibold'
                                              : 'text-gray-700 dark:text-gray-200'
                                    }
                                `}
                                >
                                    {entry.name}
                                </span>
                                {!isDir && (
                                    <span className="block text-xs text-gray-400 dark:text-gray-600">
                                        {formatSize(entry.size)} | {relativeTime(entry.modifiedAt)}
                                    </span>
                                )}
                            </div>

                            {isDir ? (
                                <LuChevronRight
                                    size={12}
                                    className="shrink-0 text-gray-300 dark:text-gray-600"
                                />
                            ) : (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleDelete(entry)
                                    }}
                                    disabled={isBusy}
                                    title={`Delete ${entry.name}`}
                                    className="
                                        opacity-0 group-hover:opacity-100 shrink-0
                                        w-4 h-4 flex items-center justify-center rounded
                                        text-gray-300 dark:text-gray-700
                                        hover:text-red-400 dark:hover:text-red-500
                                        hover:bg-red-50 dark:hover:bg-red-950/30
                                        transition-all disabled:opacity-30
                                    "
                                >
                                    {isBusy ? (
                                        <BsThreeDots className="text-gray-400 dark:text-gray-500" />
                                    ) : (
                                        <MdOutlineCancel className="text-gray-400 dark:text-gray-500" />
                                    )}
                                </button>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Context menu */}
            {contextMenu && (
                <ContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    file={contextMenu.file}
                    onOpen={openNotebook}
                    onRename={(file) => setRenamingFile(file)}
                    onDelete={handleDelete}
                    onClose={() => setContextMenu(null)}
                />
            )}
        </div>
    )
}
