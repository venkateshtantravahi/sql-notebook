import { useState, useEffect, useRef } from 'react'
import useThemeStore        from '../../store/useThemeStore.js'
import useConfigModalStore  from '../../store/useConfigModalStore.js'
import useSidebarStore      from '../../store/useSidebarStore.js'
import useZoomStore         from '../../store/useZoomStore.js'
import useNotebookStore     from '../../store/useNotebookStore.js'
import useCellStore         from '../../store/useCellStore.js'
import {SqlNotebookMark} from "../common/SqlNotebookLogo.jsx";
import KeyboardShortcutsModal from '../modal/KeyboardShortcutsModal.jsx'
import AboutModal             from '../modal/AboutModal.jsx'
import { GoGear } from "react-icons/go";
import { HiOutlinePencilSquare } from "react-icons/hi2";

// ----─ menu definitions --------------------------------------------------------------------------------

function buildMenus(actions) {
    return {
        File: [
            { label: 'New Notebook',     shortcut: '⌘N',   action: actions.newNotebook    },
            { label: 'Open Notebook...',  shortcut: '⌘O',   action: actions.openNotebook   },
            { divider: true },
            { label: 'Save',             shortcut: '⌘S',   action: actions.save           },
            { label: 'Save As...',       shortcut: '⌘⇧S',  action: actions.saveAs         },
            { label: 'Rename',                              action: actions.rename         },
            { divider: true },
            { label: 'Export Notebook As...', action: actions.exportNotebook },
        ],
        View: [
            { label: 'Toggle Sidebar',   shortcut: '⌘B',   action: actions.toggleSidebar  },
            { label: 'Toggle Theme',     shortcut: '⌘⇧T',  action: actions.toggleTheme    },
            { divider: true },
            { label: 'Zoom In',          shortcut: '⌘+',   action: actions.zoomIn         },
            { label: 'Zoom Out',         shortcut: '⌘−',   action: actions.zoomOut        },
            { label: 'Reset Zoom',       shortcut: '⌘0',   action: actions.resetZoom      },
        ],
        Help: [
            { label: 'Documentation',                       action: actions.docs           },
            { label: 'Keyboard Shortcuts', shortcut: '⌘/', action: actions.shortcuts      },
            { divider: true },
            { label: 'About sql-notebook',                  action: actions.about          },
        ],
    }
}

// ── dropdown component --------------------------------------------------------------------------------

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
          ${open
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-amber-50'
                    : 'text-gray-500 dark:text-amber-50 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800' +
                    ' dark:hover:text-gray-100'
                }
        `}
            >
                {label}
            </button>

            {open && (
                <div className="
          absolute top-full left-0 mt-1 z-50
          min-w-52 py-1 rounded-md shadow-lg
          bg-white dark:bg-gray-800
          border border-gray-200 dark:border-gray-700
        ">
                    {items.map((item, i) =>
                            item.divider ? (
                                <div key={i} className="my-1 border-t border-gray-100 dark:border-gray-700" />
                            ) : (
                                <button
                                    key={item.label}
                                    onClick={() => { item.action?.(); onClose() }}
                                    className="
                  w-full flex items-center justify-between
                  px-3 py-1.5 text-xs
                  text-gray-700 dark:text-amber-50
                  hover:bg-gray-50 dark:hover:bg-gray-700
                  hover:text-gray-900 dark:hover:text-gray-100
                  transition-colors
                "
                                >
                                    <span>{item.label}</span>
                                    {item.shortcut && (
                                        <span className="ml-6 text-gray-400 dark:text-gray-50 font-mono">
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

//  editable notebook title --------------------------------------------------------------------------------

function NotebookTitle({ onRename, editTriggerRef }) {
    const { title, isDirty, setTitle } = useNotebookStore()
    const [editing, setEditing] = useState(false)
    const [draft,   setDraft  ] = useState(title)
    const inputRef = useRef(null)

    useEffect(() => {
        if (editTriggerRef) {
            // setDraft(title)
            // setTimeout(() => inputRef.current?.select(), 0)
            editTriggerRef.current = () => setEditing(true)
        }
    }, [editTriggerRef])

    function commit() {
        const trimmed = draft.trim()
        if (trimmed && trimmed !== title) {
            setTitle(trimmed)
            onRename?.()
        }
        setEditing(false)
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter')  commit()
        if (e.key === 'Escape') setEditing(false)
    }

    if (editing) {
        return (
            <input
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
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
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Unsaved changes" />
            )}
            <span className="
        text-gray-300 dark:text-white
        group-hover:text-gray-400 dark:group-hover:text-gray-500
        text-xs transition-colors
      ">
        <HiOutlinePencilSquare />
      </span>
        </button>
    )
}

//  main header --------------------------------------------------------------------------------

function Header() {
    const { theme, toggleTheme }   = useThemeStore()
    const { open: openConfig }     = useConfigModalStore()
    const { toggle: toggleSidebar } = useSidebarStore()
    const { zoomIn, zoomOut, reset: resetZoom } = useZoomStore()
    const { markSaved , newNotebook: newNb, setTitle } = useNotebookStore()
    const { getSnapshot, loadSnapshot, clearCells } = useCellStore()
    const titleEditRef = useRef(null)

    const [openMenu,       setOpenMenu      ] = useState(null)
    const [showShortcuts,  setShowShortcuts ] = useState(false)
    const [showAbout,      setShowAbout     ] = useState(false)

    // global keyboard shortcuts --------------------------------------------------------------------------------
    useEffect(() => {
        function handle(e) {
            const mod = e.metaKey || e.ctrlKey
            if (!mod) return

            if (e.key === 'b') { e.preventDefault(); toggleSidebar() }
            if (e.key === 's' && !e.shiftKey) { e.preventDefault(); handleSave() }
            if (e.key === '=') { e.preventDefault(); zoomIn()   }
            if (e.key === '-') { e.preventDefault(); zoomOut()  }
            if (e.key === '0') { e.preventDefault(); resetZoom()}
            if (e.key === '/') { e.preventDefault(); setShowShortcuts(true) }
            if (e.key === 'n') { e.preventDefault(); handleNew() }
        }
        document.addEventListener('keydown', handle)
        return () => document.removeEventListener('keydown', handle)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    //  .sqlnb file format helpers --------------------------------------------------------------------------------

    async function writeSqlnbFile(fileHandle, data) {
        const writable = await fileHandle.createWritable()
        await writable.write(JSON.stringify(data, null, 2))
        await writable.close()
    }

    function buildSqlnb(title, cellSnapshots) {
        return {
            version:   '1',
            title,
            savedAt:   new Date().toISOString(),
            cells:     cellSnapshots,
        }
    }

    // ---- actions --------------------------------------------------------------------------------

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
                    types: [{
                        description: 'SQL Notebook',
                        accept: { 'application/x-sqlnotebook': ['.sqlnb'] },
                    }],
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
                types: [{
                    description: 'SQL Notebook',
                    accept: { 'application/x-sqlnotebook': ['.sqlnb'] },
                }],
            })
            fileHandleRef.current = handle
            await writeSqlnbFile(handle, data)
            markSaved()
        } catch (err) {
            if (err.name !== 'AbortError') console.error('Save As failed', err)
        }
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
                types: [{
                    description: 'SQL Notebook',
                    accept: {'application/x-sqlnotebook': ['.sqlnb']},
                }],
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

    async function handleExportNotebook() {
        const snapshots = getSnapshot()
        const { title } = useNotebookStore.getState()
        const data = buildSqlnb(title, snapshots)

        try {
            const handle = await window.showSaveFilePicker({
                suggestedName: `${title.replace(/\s+/g, '-')}.sqlnb`,
                types: [{
                    description: 'SQL Notebook',
                    accept: { 'application/x-sqlnotebook': ['.sqlnb'] },
                }],
            })
            await writeSqlnbFile(handle, data)
        } catch (err) {
            if (err.name !== 'AbortError') console.error('Export failed', err)
        }
    }

    // ---- menu definitions with wired actions ----------------------------------------

    const MENUS = buildMenus({
        newNotebook:    handleNew,
        openNotebook:   handleOpen,
        save:           handleSave,
        saveAs:         handleSaveAs,
        rename:         () => titleEditRef.current?.(),
        exportNotebook: handleExportNotebook,
        toggleSidebar,
        toggleTheme,
        zoomIn,
        zoomOut,
        resetZoom,
        docs:           () => window.open('https://github.com/venkateshtantravahi/sql-notebook', '_blank'),
        shortcuts:      () => setShowShortcuts(true),
        about:          () => setShowAbout(true),
    })

    function toggle(label) {
        setOpenMenu(prev => prev === label ? null : label)
    }

    return (
        <>
            <header className="
        fixed top-0 left-0 right-0 z-50 h-12
        flex items-center justify-between px-4
        bg-white dark:bg-gray-900
        border-b border-gray-200 dark:border-gray-800
      ">
                {/* Left — logo + app name */}
                <div className="flex items-center gap-2 w-40">
                    {/*<div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">*/}
                    {/*    <span className="text-white text-xs font-bold">S</span>*/}
                    {/*</div>*/}
                    <SqlNotebookMark size={28} dark={theme === 'dark'} />
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 tracking-wide whitespace-nowrap">
            sql-notebook
          </span>
                </div>

                {/* Center — notebook title inline with menus */}
                <div className="flex items-center gap-1">
                    <NotebookTitle
                        onRename={() => { fileHandleRef.current = null }}
                        editTriggerRef={titleEditRef}
                    />
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
                <div className="flex items-center gap-2 w-40 justify-end">
                    <button
                        onClick={toggleTheme}
                        className="
              text-xs px-3 py-1.5 rounded transition-colors
              text-gray-500 dark:text-gray-50
              hover:bg-gray-100 dark:hover:bg-gray-800
              hover:text-gray-700 dark:hover:text-gray-200
            "
                    >
                        {theme === 'dark' ? '☀Light' : '☾ Dark'}
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
                        <span><GoGear /></span>
                        <span>Config</span>
                    </button>
                </div>
            </header>

            <KeyboardShortcutsModal
                isOpen={showShortcuts}
                onClose={() => setShowShortcuts(false)}
            />
            <AboutModal
                isOpen={showAbout}
                onClose={() => setShowAbout(false)}
            />
        </>
    )
}

export default Header
