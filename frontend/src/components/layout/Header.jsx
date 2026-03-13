import { useState, useEffect, useRef } from 'react'
import useThemeStore from '../../store/useThemeStore.js'
import useConfigModalStore from '../../store/useConfigModalStore.js'
import useSidebarStore from '../../store/useSidebarStore.js'
import useZoomStore from '../../store/useZoomStore.js'
import useNotebookStore from '../../store/useNotebookStore.js'
import useCellStore from '../../store/useCellStore.js'
import { useQuerySocket } from '../../hooks/useQuerySocket.js'
import { SqlNotebookMark } from '../common/SqlNotebookLogo.jsx'
import KeyboardShortcutsModal from '../modal/KeyboardShortcutsModal.jsx'
import AboutModal from '../modal/AboutModal.jsx'
import { GoGear } from 'react-icons/go'
import { HiOutlinePencilSquare } from 'react-icons/hi2'
import FileSourceModal from '../modal/FileSourceModal.jsx'
import useFileSourceModalStore from '../../store/useFileSourceModalStore.js'
import { MdDarkMode, MdLightMode, MdChevronRight } from 'react-icons/md'

// menu definitions

function buildMenus(actions) {
    return {
        File: [
            { label: 'New Notebook', shortcut: '⌘N', action: actions.newNotebook },
            { label: 'Open Notebook...', shortcut: '⌘O', action: actions.openNotebook },
            { divider: true },
            { label: 'Save', shortcut: '⌘S', action: actions.save },
            { label: 'Save As...', shortcut: '⌘⇧S', action: actions.saveAs },
            { label: 'Rename', action: actions.rename },
            { divider: true },
            {
                label: 'Export Notebook As...',
                submenu: [
                    { label: 'HTML...', action: actions.exportHTML },
                    { label: 'Markdown...', action: actions.exportMarkdown },
                    { label: 'SQL Script...', action: actions.exportSQL },
                ],
            },
            { divider: true },
            { label: 'Add Data Source...', action: actions.addDataSource },
        ],
        View: [
            { label: 'Toggle Sidebar', shortcut: '⌘B', action: actions.toggleSidebar },
            { label: 'Toggle Theme', shortcut: '⌘⇧T', action: actions.toggleTheme },
            { divider: true },
            { label: 'Zoom In', shortcut: '⌘+', action: actions.zoomIn },
            { label: 'Zoom Out', shortcut: '⌘−', action: actions.zoomOut },
            { label: 'Reset Zoom', shortcut: '⌘0', action: actions.resetZoom },
        ],
        Help: [
            { label: 'Documentation', action: actions.docs },
            { label: 'Keyboard Shortcuts', shortcut: '⌘/', action: actions.shortcuts },
            { divider: true },
            { label: 'About sql-notebook', action: actions.about },
        ],
    }
}

// dropdown component

function SubItem({ item, onClose }) {
    const [open, setOpen] = useState(false)
    return (
        <div
            className="relative"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            <button
                className="
                w-full flex items-center justify-between
                px-3 py-1.5 text-xs
                text-gray-700 dark:text-gray-200
                hover:bg-gray-50 dark:hover:bg-gray-700
                hover:text-gray-900 dark:hover:text-gray-100
                transition-colors
            "
            >
                <span>{item.label}</span>
                <MdChevronRight size={14} className="text-gray-400 dark:text-gray-500" />
            </button>
            {open && (
                <div
                    className="
                    absolute left-full top-0 ml-1 z-50
                    min-w-44 py-1 rounded-md shadow-lg
                    bg-white dark:bg-gray-800
                    border border-gray-200 dark:border-gray-700
                "
                >
                    {item.submenu.map((sub) => (
                        <button
                            key={sub.label}
                            onClick={() => {
                                sub.action?.()
                                onClose()
                            }}
                            className="
                                w-full flex items-center
                                px-3 py-1.5 text-xs
                                text-gray-700 dark:text-gray-200
                                hover:bg-gray-50 dark:hover:bg-gray-700
                                hover:text-gray-900 dark:hover:text-gray-100
                                transition-colors
                            "
                        >
                            {sub.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

function Dropdown({ label, items, open, onToggle, onClose }) {
    const ref = useRef(null)

    useEffect(() => {
        if (!open) return
        function handle(e) {
            if (ref.current && !ref.current.contains(e.target)) onClose()
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [open, onClose])

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={onToggle}
                className={`
          text-xs px-3 py-1.5 rounded transition-colors
          ${
              open
                  ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800' +
                    ' dark:hover:text-gray-100'
          }
        `}
            >
                {label}
            </button>

            {open && (
                <div
                    className="
          absolute top-full left-0 mt-1 z-50
          min-w-52 py-1 rounded-md shadow-lg
          bg-white dark:bg-gray-800
          border border-gray-200 dark:border-gray-700
        "
                >
                    {items.map((item, i) =>
                        item.divider ? (
                            <div
                                key={i}
                                className="my-1 border-t border-gray-100 dark:border-gray-700"
                            />
                        ) : item.submenu ? (
                            <SubItem key={item.label} item={item} onClose={onClose} />
                        ) : (
                            <button
                                key={item.label}
                                onClick={() => {
                                    item.action?.()
                                    onClose()
                                }}
                                className="
                  w-full flex items-center justify-between
                  px-3 py-1.5 text-xs
                  text-gray-700 dark:text-gray-200
                  hover:bg-gray-50 dark:hover:bg-gray-700
                  hover:text-gray-900 dark:hover:text-gray-100
                  transition-colors
                "
                            >
                                <span>{item.label}</span>
                                {item.shortcut && (
                                    <span className="ml-6 text-gray-400 dark:text-gray-500 font-mono">
                                        {item.shortcut}
                                    </span>
                                )}
                            </button>
                        )
                    )}
                </div>
            )}
        </div>
    )
}

// editable notebook title

function NotebookTitle({ editTriggerRef }) {
    const { title, isDirty, setTitle } = useNotebookStore()
    const [editing, setEditing] = useState(false)
    const [draft, setDraft] = useState(title)
    const inputRef = useRef(null)

    useEffect(() => {
        if (editTriggerRef) {
            editTriggerRef.current = () => setEditing(true)
        }
    }, [editTriggerRef])

    function commit() {
        const trimmed = draft.trim()
        if (trimmed && trimmed !== title) {
            setTitle(trimmed)
        }
        setEditing(false)
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') setEditing(false)
    }

    if (editing) {
        return (
            <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commit}
                onKeyDown={handleKeyDown}
                className="
          text-sm font-medium text-center
          bg-transparent border-b border-blue-500
          text-gray-800 dark:text-gray-100
          focus:outline-none w-48
        "
            />
        )
    }

    return (
        <button
            onClick={() => setEditing(true)}
            className="
        flex items-center gap-1.5 group
        text-sm font-medium
        text-gray-600 dark:text-gray-300
        hover:text-gray-900 dark:hover:text-gray-100
        transition-colors
      "
            title="Click to rename"
        >
            <span>{title}</span>
            {isDirty && (
                <span
                    className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"
                    title="Unsaved changes"
                />
            )}
            <span
                className="
        text-gray-300 dark:text-gray-600
        group-hover:text-gray-400 dark:group-hover:text-gray-500
        text-xs transition-colors
      "
            >
                <HiOutlinePencilSquare className="text-gray-400 dark:text-gray-500 group-hover:text-gray-500 dark:group-hover:text-gray-400" />
            </span>
        </button>
    )
}

// main header

function Header() {
    const { theme, toggleTheme } = useThemeStore()
    const { open: openConfig } = useConfigModalStore()
    const { open: openFileSource } = useFileSourceModalStore()
    const { toggle: toggleSidebar } = useSidebarStore()
    const { zoomIn, zoomOut, reset: resetZoom } = useZoomStore()
    const { markSaved, newNotebook: newNb, setTitle } = useNotebookStore()
    const { getSnapshot, loadSnapshot, clearCells } = useCellStore()
    const runQuery = useQuerySocket()
    const titleEditRef = useRef(null)

    const [openMenu, setOpenMenu] = useState(null)
    const [showShortcuts, setShowShortcuts] = useState(false)
    const [showAbout, setShowAbout] = useState(false)

    // global keyboard shortcuts
    useEffect(() => {
        function handle(e) {
            const mod = e.metaKey || e.ctrlKey
            if (!mod) return

            if (e.key === 'b') {
                e.preventDefault()
                toggleSidebar()
            }
            if (e.key === 's' && !e.shiftKey) {
                e.preventDefault()
                handleSave()
            }
            if (e.key === '=') {
                e.preventDefault()
                zoomIn()
            }
            if (e.key === '-') {
                e.preventDefault()
                zoomOut()
            }
            if (e.key === '0') {
                e.preventDefault()
                resetZoom()
            }
            if (e.key === '/') {
                e.preventDefault()
                setShowShortcuts(true)
            }
            if (e.key === 'n') {
                e.preventDefault()
                handleNew()
            }
            if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault()
                handleRunAll()
            }
        }
        document.addEventListener('keydown', handle)
        return () => document.removeEventListener('keydown', handle)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // .sqlnb file format helpers

    async function writeSqlnbFile(fileHandle, data) {
        const writable = await fileHandle.createWritable()
        await writable.write(JSON.stringify(data, null, 2))
        await writable.close()
    }

    function buildSqlnb(title, cellSnapshots) {
        return {
            version: '1',
            title,
            savedAt: new Date().toISOString(),
            cells: cellSnapshots,
        }
    }

    // actions

    const fileHandleRef = useRef(null)

    async function handleSave() {
        const snapshots = getSnapshot()
        const { title } = useNotebookStore.getState()
        const data = buildSqlnb(title, snapshots)

        try {
            if (!fileHandleRef.current) {
                // First save — show save dialog
                fileHandleRef.current = await window.showSaveFilePicker({
                    suggestedName: `${title.replace(/\s+/g, '-')}.sqlnb`,
                    types: [
                        {
                            description: 'SQL Notebook',
                            accept: { 'application/x-sqlnotebook': ['.sqlnb'] },
                        },
                    ],
                })
            }
            await writeSqlnbFile(fileHandleRef.current, data)
            markSaved()
        } catch (err) {
            if (err.name !== 'AbortError') console.error('Save failed', err)
        }
    }

    async function handleSaveAs() {
        const snapshots = getSnapshot()
        const { title } = useNotebookStore.getState()
        const data = buildSqlnb(title, snapshots)

        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: `${title.replace(/\s+/g, '-')}.sqlnb`,
                types: [
                    {
                        description: 'SQL Notebook',
                        accept: { 'application/x-sqlnotebook': ['.sqlnb'] },
                    },
                ],
            })
            fileHandleRef.current = handle
            await writeSqlnbFile(handle, data)
            markSaved()
        } catch (err) {
            if (err.name !== 'AbortError') console.error('Save As failed', err)
        }
    }

    function handleRunAll() {
        useCellStore.getState().cells.forEach((cell) => {
            if (cell.type !== 'markdown' && cell.namespace && cell.query.trim()) {
                runQuery(cell.id, cell.namespace, cell.query.trim())
            }
        })
    }

    function handleNew() {
        if (window.confirm('Start a new notebook? Unsaved changes will be lost.')) {
            clearCells()
            newNb([])
            fileHandleRef.current = null
        }
    }

    async function handleOpen() {
        try {
            const [handle] = await window.showOpenFilePicker({
                types: [
                    {
                        description: 'SQL Notebook',
                        accept: { 'application/x-sqlnotebook': ['.sqlnb'] },
                    },
                ],
            })
            const file = await handle.getFile()
            const text = await file.text()
            const data = JSON.parse(text)

            if (window.confirm(`Load "${data.title}"? Current cells will be replaced.`)) {
                fileHandleRef.current = handle
                setTitle(data.title)
                loadSnapshot(data.cells ?? [])
            }
        } catch (err) {
            if (err.name !== 'AbortError') console.error('Open failed', err)
        }
    }

    function downloadBlob(filename, content, mime = 'text/plain') {
        const blob = new Blob([content], { type: mime })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
    }

    function slug(title) {
        return title.replace(/\s+/g, '-')
    }

    function handleExportHTML() {
        const cells = getSnapshot()
        const { title } = useNotebookStore.getState()
        const cellsHtml = cells
            .map((c) => {
                if (c.type === 'markdown') {
                    // Wrap raw markdown in a preformatted block for portability
                    return `<div class="cell markdown-cell"><pre class="md-source">${escHtml(c.content)}</pre></div>`
                }
                return `<div class="cell sql-cell"><pre><code>${escHtml(c.query)}</code></pre></div>`
            })
            .join('\n')

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escHtml(title)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 860px; margin: 2rem auto; padding: 0 1rem; color: #1f2937; }
  h1 { font-size: 1.4rem; margin-bottom: 1.5rem; }
  .cell { margin-bottom: 1.25rem; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  .cell pre { margin: 0; padding: 1rem; background: #f9fafb; font-family: 'JetBrains Mono', 'Fira Code', Menlo, monospace; font-size: 13px; overflow-x: auto; white-space: pre-wrap; }
  .sql-cell pre { background: #f3f4f6; }
  .markdown-cell .md-source { background: #fafafa; color: #374151; }
  .exported { font-size: 0.75rem; color: #9ca3af; margin-bottom: 1rem; }
</style>
</head>
<body>
<h1>${escHtml(title)}</h1>
<p class="exported">Exported from sql-notebook on ${new Date().toLocaleString()}</p>
${cellsHtml}
</body>
</html>`
        downloadBlob(`${slug(title)}.html`, html, 'text/html')
    }

    function handleExportMarkdown() {
        const cells = getSnapshot()
        const { title } = useNotebookStore.getState()
        const parts = [`# ${title}`, '']
        cells.forEach((c) => {
            if (c.type === 'markdown') {
                parts.push(c.content, '')
            } else {
                parts.push('```sql', c.query, '```', '')
            }
        })
        downloadBlob(`${slug(title)}.md`, parts.join('\n'))
    }

    function handleExportSQL() {
        const cells = getSnapshot()
        const { title } = useNotebookStore.getState()
        const lines = [`-- Notebook: ${title}`, `-- Exported: ${new Date().toISOString()}`, '']
        cells.forEach((c) => {
            if (c.type === 'markdown') {
                c.content.split('\n').forEach((line) => lines.push(`-- ${line}`))
                lines.push('')
            } else {
                const q = c.query.trimEnd()
                lines.push(q.endsWith(';') ? q : q + ';', '')
            }
        })
        downloadBlob(`${slug(title)}.sql`, lines.join('\n'))
    }

    function escHtml(str) {
        return (str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
    }

    // menu definitions with wired actions

    const MENUS = buildMenus({
        newNotebook: handleNew,
        openNotebook: handleOpen,
        save: handleSave,
        saveAs: handleSaveAs,
        rename: () => titleEditRef.current?.(),
        exportHTML: handleExportHTML,
        exportMarkdown: handleExportMarkdown,
        exportSQL: handleExportSQL,
        addDataSource: openFileSource,
        toggleSidebar,
        toggleTheme,
        zoomIn,
        zoomOut,
        resetZoom,
        docs: () => window.open('https://github.com/venkateshtantravahi/sql-notebook', '_blank'),
        shortcuts: () => setShowShortcuts(true),
        about: () => setShowAbout(true),
    })

    function toggle(label) {
        setOpenMenu((prev) => (prev === label ? null : label))
    }

    return (
        <>
            <header
                className="
        fixed top-0 left-0 right-0 z-50 h-12
        flex items-center justify-between px-4
        bg-white dark:bg-gray-900
        border-b border-gray-200 dark:border-gray-800
      "
            >
                {/* Left — logo + app name */}
                <div className="flex items-center gap-2 w-40">
                    <SqlNotebookMark size={28} dark={theme === 'dark'} />
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 tracking-wide whitespace-nowrap">
                        sql-notebook
                    </span>
                </div>

                {/* Center — notebook title inline with menus */}
                <div className="flex items-center gap-1">
                    <NotebookTitle editTriggerRef={titleEditRef} />
                    <div className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
                    {Object.entries(MENUS).map(([label, items]) => (
                        <Dropdown
                            key={label}
                            label={label}
                            items={items}
                            open={openMenu === label}
                            onToggle={() => toggle(label)}
                            onClose={() => setOpenMenu(null)}
                        />
                    ))}
                </div>

                {/* Right — theme toggle + config */}
                <div className="flex items-center gap-2 w-50 justify-end">
                    <button
                        onClick={toggleTheme}
                        className="
              text-xs px-3 py-1.5 rounded transition-colors
              text-gray-500 dark:text-gray-400
              hover:bg-gray-100 dark:hover:bg-gray-800
              hover:text-gray-700 dark:hover:text-gray-200
            "
                    >
                        <span className="flex items-center gap-1">
                            {theme === 'dark' ? (
                                <>
                                    <MdLightMode className="text-yellow-400" />
                                    <span>Light</span>
                                </>
                            ) : (
                                <>
                                    <MdDarkMode className="text-gray-400 dark:text-gray-300" />
                                    <span>Dark</span>
                                </>
                            )}
                        </span>
                    </button>

                    <button
                        onClick={openConfig}
                        className="
              text-xs px-3 py-1.5 rounded transition-colors
              bg-blue-600 hover:bg-blue-500
              text-white font-medium
              flex items-center gap-1.5
            "
                    >
                        <GoGear className="text-white" />
                        <span>Config</span>
                    </button>
                </div>
            </header>

            <KeyboardShortcutsModal
                isOpen={showShortcuts}
                onClose={() => setShowShortcuts(false)}
            />
            <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
            <FileSourceModal />
        </>
    )
}

export default Header
