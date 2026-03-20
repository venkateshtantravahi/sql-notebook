import { useState, useEffect, useRef } from 'react'
import { LuX, LuTag } from 'react-icons/lu'
import useNotebookStore from '../../store/useNotebookStore.js'
import useSidebarStore from '../../store/useSidebarStore.js'

function TagChip({ label, onRemove }) {
    return (
        <span
            className="
            inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
            bg-blue-100 dark:bg-blue-900/40
            text-blue-700 dark:text-blue-300
            border border-blue-200 dark:border-blue-700
        "
        >
            {label}
            <button
                type="button"
                onClick={onRemove}
                className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 transition-colors leading-none"
                title={`Remove tag "${label}"`}
            >
                <LuX size={10} />
            </button>
        </span>
    )
}

function NotebookInfoModal({ isOpen, onClose }) {
    const { description, tags, defaultNamespace, setDescription, setTags, setDefaultNamespace } =
        useNotebookStore()
    const namespaces = useSidebarStore((s) => s.namespaces)

    const [draftDesc, setDraftDesc] = useState('')
    const [draftTags, setDraftTags] = useState([])
    const [tagInput, setTagInput] = useState('')
    const [draftNs, setDraftNs] = useState('')
    const overlayRef = useRef(null)
    const tagInputRef = useRef(null)

    // Sync store -> local draft whenever modal opens
    useEffect(() => {
        if (!isOpen) return
        setDraftDesc(description ?? '')
        setDraftTags(Array.isArray(tags) ? [...tags] : [])
        setTagInput('')
        setDraftNs(defaultNamespace ?? '')
    }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

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

    function commitTag(raw) {
        const trimmed = raw.trim().replace(/^,+|,+$/g, '')
        if (!trimmed || draftTags.includes(trimmed)) return
        setDraftTags((prev) => [...prev, trimmed])
    }

    function handleTagKeyDown(e) {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commitTag(tagInput)
            setTagInput('')
        } else if (e.key === 'Backspace' && tagInput === '' && draftTags.length > 0) {
            setDraftTags((prev) => prev.slice(0, -1))
        }
    }

    function handleTagBlur() {
        if (tagInput.trim()) {
            commitTag(tagInput)
            setTagInput('')
        }
    }

    function handleSave() {
        // Commit any pending tag input
        if (tagInput.trim()) commitTag(tagInput)
        setDescription(draftDesc)
        setTags(draftTags)
        setDefaultNamespace(draftNs || null)
        onClose()
    }

    if (!isOpen) return null

    const inputCls = `
        w-full text-xs px-2.5 py-2 rounded
        bg-gray-50 dark:bg-gray-900/60
        border border-gray-200 dark:border-gray-600
        text-gray-800 dark:text-gray-200
        placeholder-gray-400 dark:placeholder-gray-600
        focus:outline-none focus:border-blue-400 dark:focus:border-blue-500
        transition-colors
    `

    return (
        <div
            ref={overlayRef}
            onClick={handleOverlayClick}
            className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 flex items-center justify-center p-4"
        >
            <div
                className="
                w-full max-w-md
                bg-white dark:bg-gray-900
                rounded-lg shadow-2xl
                border border-gray-200 dark:border-gray-700
                overflow-hidden
            "
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        Notebook Info
                    </span>
                    <button
                        onClick={onClose}
                        className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <LuX size={14} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-4 py-4 flex flex-col gap-4">
                    {/* Description */}
                    <div>
                        <label
                            htmlFor="notebook-description"
                            className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
                        >
                            Description
                        </label>
                        <textarea
                            id="notebook-description"
                            name="notebook-description"
                            value={draftDesc}
                            onChange={(e) => setDraftDesc(e.target.value)}
                            placeholder="A short description of this notebook..."
                            rows={3}
                            className={`${inputCls} resize-none`}
                        />
                    </div>

                    {/* Tags */}
                    <div>
                        <label
                            htmlFor="notebook-tags"
                            className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1"
                        >
                            <LuTag size={11} /> Tags
                            <span className="font-normal text-gray-400 dark:text-gray-600 ml-1">
                                (press Enter or comma to add)
                            </span>
                        </label>
                        <div
                            onClick={() => tagInputRef.current?.focus()}
                            className="
                                min-h-[36px] w-full px-2 py-1.5 rounded cursor-text
                                bg-gray-50 dark:bg-gray-900/60
                                border border-gray-200 dark:border-gray-600
                                focus-within:border-blue-400 dark:focus-within:border-blue-500
                                flex flex-wrap gap-1 items-center
                                transition-colors
                            "
                        >
                            {draftTags.map((tag) => (
                                <TagChip
                                    key={tag}
                                    label={tag}
                                    onRemove={() =>
                                        setDraftTags((prev) => prev.filter((t) => t !== tag))
                                    }
                                />
                            ))}
                            <input
                                ref={tagInputRef}
                                id="notebook-tags"
                                name="notebook-tags"
                                type="text"
                                value={tagInput}
                                onChange={(e) => setTagInput(e.target.value)}
                                onKeyDown={handleTagKeyDown}
                                onBlur={handleTagBlur}
                                placeholder={
                                    draftTags.length === 0 ? 'e.g. analytics, sales...' : ''
                                }
                                className="
                                    flex-1 min-w-[80px] text-xs bg-transparent
                                    text-gray-800 dark:text-gray-200
                                    placeholder-gray-400 dark:placeholder-gray-600
                                    focus:outline-none
                                "
                            />
                        </div>
                    </div>

                    {/* Default Namespace */}
                    <div>
                        <label
                            htmlFor="notebook-namespace"
                            className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
                        >
                            Default Namespace
                        </label>
                        <select
                            id="notebook-namespace"
                            name="notebook-namespace"
                            value={draftNs}
                            onChange={(e) => setDraftNs(e.target.value)}
                            className={inputCls}
                        >
                            <option value="">-- None --</option>
                            {namespaces.map((ns) => {
                                const name = typeof ns === 'string' ? ns : ns.name
                                return (
                                    <option key={name} value={name}>
                                        {name}
                                    </option>
                                )
                            })}
                        </select>
                        <p className="mt-1 text-xs text-gray-400 dark:text-gray-600">
                            New SQL cells will inherit this namespace.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100 dark:border-gray-800">
                    <button
                        onClick={onClose}
                        className="
                            text-xs px-3 py-1.5 rounded transition-colors
                            text-gray-500 dark:text-gray-400
                            hover:bg-gray-100 dark:hover:bg-gray-800
                        "
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="
                            text-xs px-4 py-1.5 rounded font-medium transition-colors
                            bg-blue-600 hover:bg-blue-500 text-white
                        "
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    )
}

export default NotebookInfoModal
