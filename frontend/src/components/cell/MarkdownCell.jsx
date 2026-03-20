import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
    LuTrash2,
    LuPencil,
    LuEye,
    LuBold,
    LuItalic,
    LuStrikethrough,
    LuCode,
    LuCodeXml,
    LuHeading1,
    LuHeading2,
    LuHeading3,
    LuList,
    LuListOrdered,
    LuListChecks,
    LuQuote,
    LuLink,
    LuMinus,
    LuTable2,
    LuImagePlus,
    LuX,
} from 'react-icons/lu'
import useCellStore from '../../store/useCellStore.js'

// ---------------------------------------------------------------------------
// Toolbar primitives
// ---------------------------------------------------------------------------

function ToolbarBtn({ onAction, title, children }) {
    // onMouseDown + preventDefault keeps textarea focused so selectionStart
    // is still valid when the formatting function reads it
    return (
        <button
            onMouseDown={(e) => {
                e.preventDefault()
                onAction()
            }}
            title={title}
            className="
                p-1 rounded
                text-gray-500 dark:text-gray-400
                hover:text-gray-900 dark:hover:text-gray-100
                hover:bg-gray-200 dark:hover:bg-gray-600
                transition-colors
            "
        >
            {children}
        </button>
    )
}

function Sep() {
    return <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1 shrink-0" />
}

// ---------------------------------------------------------------------------
// Image / media insert popover
// ---------------------------------------------------------------------------

/** Resizes an image file via canvas and returns a base64 webp data URL. */
function compressImage(file, maxPx = 1200) {
    return new Promise((resolve, reject) => {
        const img = new Image()
        const objectUrl = URL.createObjectURL(file)
        img.onload = () => {
            URL.revokeObjectURL(objectUrl)
            let w = img.naturalWidth
            let h = img.naturalHeight
            if (w > maxPx || h > maxPx) {
                if (w >= h) {
                    h = Math.round((h * maxPx) / w)
                    w = maxPx
                } else {
                    w = Math.round((w * maxPx) / h)
                    h = maxPx
                }
            }
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            canvas.getContext('2d').drawImage(img, 0, 0, w, h)
            resolve({ dataUrl: canvas.toDataURL('image/webp', 0.85), width: w, height: h })
        }
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl)
            reject(new Error('Failed to load image'))
        }
        img.src = objectUrl
    })
}

function stemOf(filename) {
    const parts = filename.split('.')
    return parts.length > 1 ? parts.slice(0, -1).join('.') : filename
}

// Rendered via a portal at document.body so the parent cell's overflow-hidden
// never clips it. Position is calculated from the anchor button's screen rect.
function ImagePopover({ anchorRef, cellId, updateAttachment, onInsert, onClose }) {
    const [url, setUrl] = useState('')
    const [alt, setAlt] = useState('')
    const [pos, setPos] = useState({ top: 0, left: 0 })
    const [uploading, setUploading] = useState(false)
    const [uploadErr, setUploadErr] = useState('')
    const urlRef = useRef(null)
    const containerRef = useRef(null)
    const fileInputRef = useRef(null)
    // Prevents the outside-click listener from closing the popover while the
    // native file-picker dialog is open (the dialog takes OS focus without
    // generating browser mousedown events, so the guard must be explicit).
    const isPickingFileRef = useRef(false)

    // Calculate position from anchor button and auto-focus URL input
    useEffect(() => {
        if (anchorRef?.current) {
            const r = anchorRef.current.getBoundingClientRect()
            setPos({ top: r.bottom + 6, left: r.left })
        }
        const t = setTimeout(() => urlRef.current?.focus(), 0)
        return () => clearTimeout(t)
    }, [anchorRef])

    // Close when clicking outside both the popover and the anchor button.
    // Skipped while the native file-picker is open.
    useEffect(() => {
        function handle(e) {
            if (isPickingFileRef.current) return
            if (
                containerRef.current &&
                !containerRef.current.contains(e.target) &&
                anchorRef?.current &&
                !anchorRef.current.contains(e.target)
            )
                onClose()
        }
        document.addEventListener('mousedown', handle)
        return () => document.removeEventListener('mousedown', handle)
    }, [onClose, anchorRef])

    // Opens the native file picker. Uses a ref guard so the outside-click
    // listener doesn't close the popover while the dialog is open.
    function openFilePicker() {
        isPickingFileRef.current = true
        fileInputRef.current?.click()
    }

    function handleInsertUrl() {
        const trimmed = url.trim()
        if (!trimmed) {
            openFilePicker()
            return
        }
        onInsert(`![${alt.trim() || 'image'}](${trimmed})`)
        onClose()
    }

    async function handleFileChange(e) {
        isPickingFileRef.current = false
        const file = e.target.files?.[0]
        if (!file) return
        setUploading(true)
        setUploadErr('')
        try {
            const { dataUrl, width, height } = await compressImage(file)
            const mimeType = dataUrl.split(';')[0].slice(5)
            const data = dataUrl.split(',')[1]
            const filename = file.name
            updateAttachment(cellId, filename, {
                mimeType,
                encoding: 'base64',
                data,
                size: Math.round(data.length * 0.75),
                width,
                height,
            })
            onInsert(`![${alt.trim() || stemOf(filename)}](attachment:${filename})`)
            onClose()
        } catch (err) {
            setUploadErr(err.message ?? 'Compression failed')
        } finally {
            setUploading(false)
        }
    }

    function handleKeyDown(e) {
        if (e.key === 'Enter') {
            e.preventDefault()
            handleInsertUrl()
        }
        if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
        }
    }

    const inputCls = `
        w-full text-xs px-2 py-1.5 rounded
        bg-gray-50 dark:bg-gray-900
        border border-gray-200 dark:border-gray-600
        text-gray-800 dark:text-gray-200
        placeholder-gray-300 dark:placeholder-gray-600
        focus:outline-none focus:border-blue-400 dark:focus:border-blue-500
    `

    return createPortal(
        <div
            ref={containerRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
            className="
                w-72 p-3 rounded-lg shadow-xl
                bg-white dark:bg-gray-800
                border border-gray-200 dark:border-gray-600
            "
        >
            {/* Hidden file input for local uploads */}
            <input
                ref={fileInputRef}
                id="img-popover-file"
                name="img-popover-file"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
                onCancel={() => {
                    isPickingFileRef.current = false
                }}
            />

            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                    Insert Image / GIF
                </span>
                <button
                    onMouseDown={(e) => {
                        e.preventDefault()
                        onClose()
                    }}
                    title="Close"
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                    <LuX size={12} />
                </button>
            </div>

            <div className="flex flex-col gap-2">
                <div>
                    <label
                        htmlFor="img-popover-url"
                        className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5"
                    >
                        URL{' '}
                        <span className="text-gray-400 dark:text-gray-600">(image, GIF, etc.)</span>
                    </label>
                    <input
                        ref={urlRef}
                        id="img-popover-url"
                        name="img-url"
                        type="text"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="https://example.com/image.png"
                        className={inputCls}
                    />
                </div>

                <div>
                    <label
                        htmlFor="img-popover-alt"
                        className="block text-xs text-gray-500 dark:text-gray-400 mb-0.5"
                    >
                        Alt text{' '}
                        <span className="text-gray-400 dark:text-gray-600">(optional)</span>
                    </label>
                    <input
                        id="img-popover-alt"
                        name="img-alt"
                        type="text"
                        value={alt}
                        onChange={(e) => setAlt(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Descriptive text for the image"
                        className={inputCls}
                    />
                </div>

                <button
                    onMouseDown={(e) => {
                        e.preventDefault()
                        handleInsertUrl()
                    }}
                    className="
                        mt-1 w-full py-1.5 rounded text-xs font-medium
                        bg-blue-500 hover:bg-blue-600 text-white
                        transition-colors
                    "
                >
                    {url.trim() ? 'Insert URL' : 'Insert URL'}
                </button>

                {/* Divider */}
                <div className="flex items-center gap-2 my-0.5">
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-600" />
                    <span className="text-xs text-gray-400 dark:text-gray-500">or</span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-gray-600" />
                </div>

                {/* Local file upload */}
                <button
                    onClick={openFilePicker}
                    disabled={uploading}
                    title="Pick an image from your computer - stored inline as base64"
                    className="
                        w-full py-1.5 rounded text-xs font-medium flex items-center justify-center gap-1.5
                        border border-gray-200 dark:border-gray-600
                        text-gray-600 dark:text-gray-300
                        hover:bg-gray-100 dark:hover:bg-gray-700
                        disabled:opacity-50 disabled:cursor-not-allowed
                        transition-colors
                    "
                >
                    <LuImagePlus size={12} />
                    {uploading ? 'Processing...' : 'Upload from computer'}
                </button>

                {uploadErr && (
                    <span
                        className="text-xs text-red-500 dark:text-red-400 truncate"
                        title={uploadErr}
                    >
                        {uploadErr}
                    </span>
                )}
            </div>
        </div>,
        document.body
    )
}

// ---------------------------------------------------------------------------
// Custom ReactMarkdown component overrides
// ---------------------------------------------------------------------------

// Renders markdown images with max-width clamping and a visible broken-image
// placeholder instead of the browser's default torn-icon.  No crossOrigin
// attribute is set so the browser fetches images as opaque requests, which
// avoids CORS/CORP blocks that affect credentialed cross-origin fetches.
const markdownComponents = {
    img: ({ src, alt }) => (
        <span style={{ display: 'inline-block', maxWidth: '100%' }}>
            <img
                src={src}
                alt={alt || ''}
                style={{ maxWidth: '100%', height: 'auto', display: 'block' }}
                onError={(e) => {
                    const el = e.currentTarget
                    el.style.display = 'none'
                    const placeholder = document.createElement('span')
                    placeholder.textContent = `[!] Could not load image${alt ? `: ${alt}` : ''}`
                    placeholder.style.cssText =
                        'display:inline-block;padding:4px 8px;font-size:11px;border-radius:4px;background:#fef3c7;color:#92400e;border:1px solid #fde68a'
                    el.parentNode.appendChild(placeholder)
                }}
            />
        </span>
    ),
}

// ---------------------------------------------------------------------------
// Formatting helpers
// All helpers receive a single-arg `update(newContent)` callback so the
// call-sites don't need to thread cellId through every invocation.
// ---------------------------------------------------------------------------

/** Wrap the selection (or `placeholder` when nothing selected) with `marker`. */
function applyInline(el, content, update, marker, placeholder) {
    const s = el.selectionStart
    const e = el.selectionEnd
    const selected = content.slice(s, e) || placeholder
    const next = content.slice(0, s) + marker + selected + marker + content.slice(e)
    update(next)
    requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(s + marker.length, s + marker.length + selected.length)
    })
}

/** Wrap the selection (or `placeholder`) with different open/close delimiters. */
function applyInlinePair(el, content, update, open, close, placeholder) {
    const s = el.selectionStart
    const e = el.selectionEnd
    const selected = content.slice(s, e) || placeholder
    const next = content.slice(0, s) + open + selected + close + content.slice(e)
    update(next)
    requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(s + open.length, s + open.length + selected.length)
    })
}

/** Prepend `prefix` to the beginning of the current line. */
function applyBlock(el, content, update, prefix) {
    const s = el.selectionStart
    const lineStart = content.lastIndexOf('\n', s - 1) + 1
    const next = content.slice(0, lineStart) + prefix + content.slice(lineStart)
    update(next)
    requestAnimationFrame(() => {
        el.focus()
        const pos = s + prefix.length
        el.setSelectionRange(pos, pos)
    })
}

/**
 * Insert `snippet` at the current cursor position.
 * `cursorOffset` controls where the cursor lands after insertion
 * (defaults to end of snippet).
 */
function insertSnippet(el, content, update, snippet, cursorOffset) {
    const s = el.selectionStart
    const next = content.slice(0, s) + snippet + content.slice(s)
    update(next)
    requestAnimationFrame(() => {
        el.focus()
        const pos = s + (cursorOffset ?? snippet.length)
        el.setSelectionRange(pos, pos)
    })
}

// ---------------------------------------------------------------------------
// Formatting toolbar
// ---------------------------------------------------------------------------

function MarkdownToolbar({ textareaRef, cell, updateSource, updateAttachment }) {
    // Stable single-arg updater - no need to pass cellId into every helper
    const update = useCallback(
        (newContent) => updateSource(cell.id, newContent),
        [cell.id, updateSource]
    )

    const [showImagePopover, setShowImagePopover] = useState(false)
    const imageButtonRef = useRef(null)

    // Shorthand getters evaluated at interaction time (not at render)
    const el = () => textareaRef.current
    const c = () => cell.source

    function handleImageInsert(snippet) {
        const textarea = textareaRef.current
        if (textarea) {
            insertSnippet(textarea, cell.source, update, snippet)
        }
    }

    return (
        <div
            className="
            relative
            flex items-center flex-wrap gap-0.5 px-2 py-1
            border-b border-gray-200 dark:border-gray-700
            bg-gray-50 dark:bg-[#1e2a40]
        "
        >
            {/* -- Inline styles -- */}
            <ToolbarBtn
                title="Bold - wraps selection with **bold**"
                onAction={() => applyInline(el(), c(), update, '**', 'bold text')}
            >
                <LuBold size={13} />
            </ToolbarBtn>

            <ToolbarBtn
                title="Italic - wraps selection with _italic_"
                onAction={() => applyInline(el(), c(), update, '_', 'italic text')}
            >
                <LuItalic size={13} />
            </ToolbarBtn>

            <ToolbarBtn
                title="Strikethrough - wraps selection with ~~strikethrough~~"
                onAction={() => applyInline(el(), c(), update, '~~', 'strikethrough')}
            >
                <LuStrikethrough size={13} />
            </ToolbarBtn>

            <ToolbarBtn
                title="Inline code - wraps selection with `backticks`"
                onAction={() => applyInline(el(), c(), update, '`', 'code')}
            >
                <LuCode size={13} />
            </ToolbarBtn>

            <Sep />

            {/* -- Headings -- */}
            <ToolbarBtn
                title="Heading 1 - prepends # to the current line"
                onAction={() => applyBlock(el(), c(), update, '# ')}
            >
                <LuHeading1 size={14} />
            </ToolbarBtn>

            <ToolbarBtn
                title="Heading 2 - prepends ## to the current line"
                onAction={() => applyBlock(el(), c(), update, '## ')}
            >
                <LuHeading2 size={14} />
            </ToolbarBtn>

            <ToolbarBtn
                title="Heading 3 - prepends ### to the current line"
                onAction={() => applyBlock(el(), c(), update, '### ')}
            >
                <LuHeading3 size={14} />
            </ToolbarBtn>

            <Sep />

            {/* -- Lists -- */}
            <ToolbarBtn
                title="Bullet list - prepends - to the current line"
                onAction={() => applyBlock(el(), c(), update, '- ')}
            >
                <LuList size={13} />
            </ToolbarBtn>

            <ToolbarBtn
                title="Numbered list - prepends 1. to the current line"
                onAction={() => applyBlock(el(), c(), update, '1. ')}
            >
                <LuListOrdered size={13} />
            </ToolbarBtn>

            <ToolbarBtn
                title="Checklist - prepends - [ ] to the current line"
                onAction={() => applyBlock(el(), c(), update, '- [ ] ')}
            >
                <LuListChecks size={13} />
            </ToolbarBtn>

            <Sep />

            {/* -- Block elements -- */}
            <ToolbarBtn
                title="Blockquote - prepends > to the current line"
                onAction={() => applyBlock(el(), c(), update, '> ')}
            >
                <LuQuote size={13} />
            </ToolbarBtn>

            <ToolbarBtn
                title="Code block - inserts a fenced ``` code block"
                onAction={() => insertSnippet(el(), c(), update, '\n```\n\n```\n', 5)}
            >
                <LuCodeXml size={13} />
            </ToolbarBtn>

            <ToolbarBtn
                title="Link - wraps selection as [text](url)"
                onAction={() => applyInlinePair(el(), c(), update, '[', '](url)', 'link text')}
            >
                <LuLink size={13} />
            </ToolbarBtn>

            <ToolbarBtn
                title="Horizontal rule - inserts ---"
                onAction={() => insertSnippet(el(), c(), update, '\n\n---\n\n')}
            >
                <LuMinus size={13} />
            </ToolbarBtn>

            <ToolbarBtn
                title="Table - inserts a 2-column markdown table template"
                onAction={() =>
                    insertSnippet(
                        el(),
                        c(),
                        update,
                        '\n| Column 1 | Column 2 |\n|----------|----------|\n| Cell     | Cell     |\n',
                        2
                    )
                }
            >
                <LuTable2 size={13} />
            </ToolbarBtn>

            <Sep />

            {/* -- Image / media insert -- */}
            {/* Rendered as a plain button (not ToolbarBtn) so we can attach a
                ref for calculating the portal's screen position. */}
            <button
                ref={imageButtonRef}
                onMouseDown={(e) => {
                    e.preventDefault()
                    setShowImagePopover((v) => !v)
                }}
                title="Insert image or GIF - opens a URL input to embed media"
                className="
                    p-1 rounded
                    text-gray-500 dark:text-gray-400
                    hover:text-gray-900 dark:hover:text-gray-100
                    hover:bg-gray-200 dark:hover:bg-gray-600
                    transition-colors
                "
            >
                <LuImagePlus size={13} />
            </button>

            {showImagePopover && (
                <ImagePopover
                    anchorRef={imageButtonRef}
                    cellId={cell.id}
                    updateAttachment={updateAttachment}
                    onInsert={handleImageInsert}
                    onClose={() => setShowImagePopover(false)}
                />
            )}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Attachment resolver
// ---------------------------------------------------------------------------

// Replaces attachment:filename references with inline data URIs for rendering
function resolveAttachments(source, attachments) {
    if (!attachments || Object.keys(attachments).length === 0) return source
    return source.replace(/\(attachment:([^)]+)\)/g, (_, filename) => {
        const att = attachments[filename]
        if (!att) return `(attachment:${filename})`
        return `(data:${att.mimeType};${att.encoding},${att.data})`
    })
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function MarkdownCell({ cell }) {
    const { updateSource, updateAttachment, deleteCell } = useCellStore()
    const [editing, setEditing] = useState(!cell.source)
    const textareaRef = useRef(null)

    // Focus + auto-size the textarea whenever we switch into edit mode
    useEffect(() => {
        if (editing && textareaRef.current) {
            const el = textareaRef.current
            el.focus()
            el.setSelectionRange(el.value.length, el.value.length)
            el.style.height = 'auto'
            el.style.height = `${el.scrollHeight}px`
        }
    }, [editing])

    const handleChange = useCallback(
        (e) => {
            updateSource(cell.id, e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${e.target.scrollHeight}px`
        },
        [cell.id, updateSource]
    )

    function handleKeyDown(e) {
        if ((e.key === 'Enter' && e.shiftKey) || e.key === 'Escape') {
            e.preventDefault()
            setEditing(false)
        }
    }

    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#161f2e] shadow-sm overflow-hidden">
            {/* -- Cell header bar -- */}
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
                        title={editing ? 'Switch to preview (Shift+Enter)' : 'Edit this cell'}
                        className="
                            p-1 rounded text-gray-400 dark:text-gray-500
                            hover:text-blue-500 dark:hover:text-blue-400
                            hover:bg-gray-100 dark:hover:bg-gray-700
                            transition-colors
                        "
                    >
                        {editing ? <LuEye size={13} /> : <LuPencil size={13} />}
                    </button>
                    <button
                        onClick={() => deleteCell(cell.id)}
                        title="Delete this cell"
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

            {/* -- Edit mode: formatting ribbon + split pane -- */}
            {editing && (
                <>
                    <MarkdownToolbar
                        textareaRef={textareaRef}
                        cell={cell}
                        updateSource={updateSource}
                        updateAttachment={updateAttachment}
                    />

                    {/* Split pane */}
                    <div className="flex" style={{ minHeight: '180px' }}>
                        {/* Left: raw editor */}
                        <div className="w-1/2 flex flex-col border-r border-gray-200 dark:border-gray-700">
                            <div className="px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1e2a40]">
                                <label
                                    htmlFor={`md-editor-${cell.id}`}
                                    className="text-xs text-gray-400 dark:text-gray-500 select-none cursor-default"
                                >
                                    Editor
                                </label>
                            </div>
                            <textarea
                                ref={textareaRef}
                                id={`md-editor-${cell.id}`}
                                name="md-source"
                                value={cell.source}
                                onChange={handleChange}
                                onKeyDown={handleKeyDown}
                                placeholder="Write markdown here... (Shift+Enter to preview)"
                                className="
                                    flex-1 w-full px-4 py-3
                                    resize-none outline-none
                                    text-sm font-mono
                                    bg-white dark:bg-[#0f1623]
                                    text-gray-800 dark:text-gray-200
                                    placeholder-gray-300 dark:placeholder-gray-600
                                "
                                style={{ minHeight: '148px' }}
                            />
                        </div>

                        {/* Right: live preview */}
                        <div className="w-1/2 flex flex-col">
                            <div className="px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1e2a40]">
                                <span className="text-xs text-gray-400 dark:text-gray-500 select-none">
                                    Preview
                                </span>
                            </div>
                            <div className="flex-1 px-5 py-3 overflow-auto markdown-preview text-sm text-gray-800 dark:text-gray-200 bg-white dark:bg-[#161f2e]">
                                {cell.source.trim() ? (
                                    <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        urlTransform={(url) => url}
                                        components={markdownComponents}
                                    >
                                        {resolveAttachments(cell.source, cell.attachments)}
                                    </ReactMarkdown>
                                ) : (
                                    <span className="text-gray-300 dark:text-gray-600 italic">
                                        Preview will appear here...
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* -- Preview-only mode: click anywhere to edit -- */}
            {!editing && (
                <div
                    onClick={() => setEditing(true)}
                    title="Click to edit"
                    className="px-5 py-4 cursor-text markdown-preview text-sm text-gray-800 dark:text-gray-200"
                >
                    {cell.source.trim() ? (
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            urlTransform={(url) => url}
                            components={markdownComponents}
                        >
                            {resolveAttachments(cell.source, cell.attachments)}
                        </ReactMarkdown>
                    ) : (
                        <span className="text-gray-300 dark:text-gray-600 italic">
                            Empty -- click to edit
                        </span>
                    )}
                </div>
            )}
        </div>
    )
}

export default MarkdownCell
