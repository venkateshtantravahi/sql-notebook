import { useEffect, useRef } from 'react'

const SECTIONS = [
    {
        title: 'Notebook',
        shortcuts: [
            { keys: '⌘ N',      action: 'New notebook'           },
            { keys: '⌘ O',      action: 'Open notebook'          },
            { keys: '⌘ S',      action: 'Save notebook'          },
            { keys: '⌘ ⇧ S',   action: 'Save notebook as'       },
        ],
    },
    {
        title: 'Cell',
        shortcuts: [
            { keys: '⌘ ↵',     action: 'Run cell'               },
            { keys: '⌘ ⇧ ↵',  action: 'Run all cells'          },
            { keys: '⌘ D',     action: 'Delete cell'             },
        ],
    },
    {
        title: 'View',
        shortcuts: [
            { keys: '⌘ B',     action: 'Toggle sidebar'          },
            { keys: '⌘ +',     action: 'Zoom in'                 },
            { keys: '⌘ −',     action: 'Zoom out'                },
            { keys: '⌘ 0',     action: 'Reset zoom'              },
            { keys: '⌘ ⇧ T',  action: 'Toggle theme'            },
        ],
    },
    {
        title: 'General',
        shortcuts: [
            { keys: '⌘ /',     action: 'Keyboard shortcuts'      },
            { keys: 'Esc',     action: 'Close modal / dropdown'  },
        ],
    },
]

function KeyboardShortcutsModal({ isOpen, onClose }) {
    const overlayRef = useRef(null)

    useEffect(() => {
        if (!isOpen) return
        function handle(e) {
            if (e.key === 'Escape') onClose()
        }
        document.addEventListener('keydown', handle)
        return () => document.removeEventListener('keydown', handle)
    }, [isOpen, onClose])

    function handleOverlayClick(e) {
        if (e.target === overlayRef.current) onClose()
    }

    if (!isOpen) return null

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            className="
        fixed inset-0 z-50
        bg-black/50 dark:bg-black/70
        flex items-center justify-center p-4
      "
        >
            <div className="
        w-full max-w-lg
        bg-white dark:bg-gray-900
        rounded-lg shadow-2xl
        border border-gray-200 dark:border-gray-700
        overflow-hidden
      ">
                {/* Header */}
                <div className="
          flex items-center justify-between
          px-5 py-4
          border-b border-gray-100 dark:border-gray-800
        ">
                    <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        Keyboard Shortcuts
                    </h2>
                    <button
                        onClick={onClose}
                        className="
              text-gray-400 hover:text-gray-600
              dark:text-gray-500 dark:hover:text-gray-300
              text-lg leading-none transition-colors
            "
                    >
                        ✕
                    </button>
                </div>

                {/* Shortcuts grid */}
                <div className="px-5 py-4 grid grid-cols-2 gap-6 max-h-96 overflow-y-auto">
                    {SECTIONS.map(section => (
                        <div key={section.title}>
                            <p className="
                text-xs font-bold uppercase tracking-wider
                text-gray-400 dark:text-gray-500 mb-2
              ">
                                {section.title}
                            </p>
                            <div className="flex flex-col gap-1.5">
                                {section.shortcuts.map(s => (
                                    <div key={s.keys} className="flex items-center justify-between gap-4">
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      {s.action}
                    </span>
                                        <kbd className="
                      text-xs font-mono px-2 py-0.5 rounded
                      bg-gray-100 dark:bg-gray-800
                      border border-gray-200 dark:border-gray-700
                      text-gray-600 dark:text-gray-400
                      whitespace-nowrap flex-shrink-0
                    ">
                                            {s.keys}
                                        </kbd>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default KeyboardShortcutsModal