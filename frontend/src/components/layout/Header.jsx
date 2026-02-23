import { useState, useRef, useEffect } from "react";
import useThemeStore from "../../store/useThemeStore.js";
import useConfigModalStore from "../../store/useConfigModalStore.js";


// ── dropdown menu ────────────────────────────────────────────────────────────

const MENUS = {
    File: [
        { label: 'New Notebook',     shortcut: '⌘N' },
        { label: 'Open...',          shortcut: '⌘O' },
        { divider: true },
        { label: 'Save',             shortcut: '⌘S' },
        { label: 'Export Results',   shortcut: '⌘E' },
    ],
    View: [
        { label: 'Toggle Sidebar',   shortcut: '⌘B' },
        { label: 'Toggle Theme',     shortcut: '⌘⇧T' },
        { divider: true },
        { label: 'Zoom In',          shortcut: '⌘+' },
        { label: 'Zoom Out',         shortcut: '⌘-' },
        { label: 'Reset Zoom',       shortcut: '⌘0' },
    ],
    Help: [
        { label: 'Documentation'                    },
        { label: 'Keyboard Shortcuts', shortcut: '⌘/' },
        { divider: true },
        { label: 'About sql-notebook'               },
    ],
}

function Dropdown({ label, items, open, onToggle, onClose }) {
    const ref = useRef(null)

    // Close on outside click
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
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-800 dark:hover:text-gray-100'
                }
        `}
            >
                {label}
            </button>

            {open && (
                <div className="
          absolute top-full left-0 mt-1 z-50
          min-w-48 py-1 rounded-md shadow-lg
          bg-white dark:bg-gray-800
          border border-gray-200 dark:border-gray-700
        ">
                    {items.map((item, i) =>
                            item.divider ? (
                                <div
                                    key={i}
                                    className="my-1 border-t border-gray-100 dark:border-gray-700"
                                />
                            ) : (
                                <button
                                    key={item.label}
                                    onClick={() => {
                                        // TODO: wire up actions in feat/header-actions
                                        onClose()
                                    }}
                                    className="
                  w-full flex items-center justify-between
                  px-3 py-1.5 text-xs
                  text-gray-700 dark:text-gray-300
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


function Header() {
    const { theme, toggleTheme } = useThemeStore()
    const [openMenu, setOpenMenu] = useState(null)
    const { open } = useConfigModalStore()

    function toggle(label) {
        setOpenMenu(prev => prev === label ? null : label)
    }
    return (
        <header className="
      fixed top-0 left-0 right-0 z-50 h-12
      flex items-center justify-between px-4
      bg-white dark:bg-gray-900
      border-b border-gray-200 dark:border-gray-800
    ">
            {/* Left — logo + app name */}
            <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-xs font-bold">S</span>
                </div>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 tracking-wide">
          sql-notebook
        </span>
            </div>

            {/* Center — dropdown menus */}
            <div className="flex items-center gap-0.5">
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

            {/* Right — theme toggle + config button */}
            <div className="flex items-center gap-2">
                <button
                    onClick={toggleTheme}
                    className="
            text-xs px-3 py-1.5 rounded transition-colors
            text-gray-500 dark:text-gray-400
            hover:bg-gray-100 dark:hover:bg-gray-800
            hover:text-gray-700 dark:hover:text-gray-200
          "
                >
                    {theme === 'dark' ? '☀ Light' : '☾ Dark'}
                </button>

                <button
                    onClick={open}
                    className="
            text-xs px-3 py-1.5 rounded transition-colors
            bg-blue-600 hover:bg-blue-500
            text-white font-medium
            flex items-center gap-1.5
          "
                >
                    <span>⚙</span>
                    <span>Config</span>
                </button>
            </div>
        </header>
    )
}

export default Header