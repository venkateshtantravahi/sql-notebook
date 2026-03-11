import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import { LuTrash2, LuPencil, LuCheck } from 'react-icons/lu'
import useCellStore from '../../store/useCellStore.js'

function MarkdownCell({ cell }) {
    const { updateContent, deleteCell } = useCellStore()
    const [editing, setEditing] = useState(!cell.content)
    const textareaRef = useRef(null)

    // Auto-focus textarea when entering edit mode
    useEffect(() => {
        if (editing && textareaRef.current) {
            textareaRef.current.focus()
            const len = textareaRef.current.value.length
            textareaRef.current.setSelectionRange(len, len)
        }
    }, [editing])

    // Auto-resize textarea to fit content
    function handleChange(e) {
        updateContent(cell.id, e.target.value)
        e.target.style.height = 'auto'
        e.target.style.height = `${e.target.scrollHeight}px`
    }

    function handleKeyDown(e) {
        // Shift+Enter or Escape → exit edit mode
        if ((e.key === 'Enter' && e.shiftKey) || e.key === 'Escape') {
            e.preventDefault()
            setEditing(false)
        }
    }

    return (
        <div
            className="
            rounded-lg border border-gray-200 dark:border-gray-700
            bg-white dark:bg-[#161f2e]
            shadow-sm overflow-hidden
        "
        >
            {/* Toolbar */}
            <div
                className="
                flex items-center justify-between
                px-3 py-1.5
                border-b border-gray-200 dark:border-gray-700
                bg-gray-50 dark:bg-[#1a2540]
            "
            >
                <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                    Markdown
                </span>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setEditing((v) => !v)}
                        title={editing ? 'Preview (Shift+Enter)' : 'Edit'}
                        className="
                            p-1 rounded text-gray-400 dark:text-gray-500
                            hover:text-blue-500 dark:hover:text-blue-400
                            hover:bg-gray-100 dark:hover:bg-gray-700
                            transition-colors
                        "
                    >
                        {editing ? <LuCheck size={13} /> : <LuPencil size={13} />}
                    </button>
                    <button
                        onClick={() => deleteCell(cell.id)}
                        title="Delete cell"
                        className="
                            p-1 rounded text-gray-400 dark:text-gray-500
                            hover:text-red-500 dark:hover:text-red-400
                            hover:bg-gray-100 dark:hover:bg-gray-700
                            transition-colors
                        "
                    >
                        <LuTrash2 size={13} />
                    </button>
                </div>
            </div>

            {/* Edit mode */}
            {editing && (
                <textarea
                    ref={textareaRef}
                    value={cell.content}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder="Write markdown here… (Shift+Enter to preview)"
                    rows={4}
                    className="
                        w-full px-4 py-3 resize-none outline-none
                        text-sm font-mono
                        bg-white dark:bg-gray-900
                        text-gray-800 dark:text-gray-200
                        placeholder-gray-300 dark:placeholder-gray-600
                    "
                    style={{ minHeight: '80px' }}
                />
            )}

            {/* Preview mode */}
            {!editing && (
                <div
                    onClick={() => setEditing(true)}
                    title="Click to edit"
                    className="px-5 py-4 cursor-text markdown-preview text-sm text-gray-800 dark:text-gray-200"
                >
                    {cell.content.trim() ? (
                        <ReactMarkdown>{cell.content}</ReactMarkdown>
                    ) : (
                        <span className="text-gray-300 dark:text-gray-600 italic">
                            Empty — click to edit
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}

export default MarkdownCell
