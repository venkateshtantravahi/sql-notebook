import { create } from 'zustand'

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

function makeId() {
    const arr = new Uint8Array(4)
    crypto.getRandomValues(arr)
    return (
        'c_' +
        Array.from(arr)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
    )
}

// ---------------------------------------------------------------------------
// Source serialisation helpers
// Internal state: plain string (easy for editors)
// On-disk format: array of lines (git-diffable)
// ---------------------------------------------------------------------------

export function sourceToLines(str) {
    if (!str) return []
    const lines = str.split('\n')
    const result = lines.map((l, i) => (i < lines.length - 1 ? l + '\n' : l))
    // drop trailing empty string produced by a source that ends with \n
    if (result.length > 0 && result[result.length - 1] === '') result.pop()
    return result
}

export function linesToSource(arr) {
    if (Array.isArray(arr)) return arr.join('')
    if (typeof arr === 'string') return arr
    return ''
}

// ---------------------------------------------------------------------------
// Cell factory
// ---------------------------------------------------------------------------

function makeCell(overrides = {}) {
    return {
        id: makeId(),
        type: 'sql',
        source: '', // unified field: SQL query or markdown text
        namespace: null,
        attachments: null, // { [filename]: { mimeType, encoding, size, width, height, data } } | null
        status: 'idle',
        results: null,
        error: null,
        ...overrides,
    }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const useCellStore = create((set, get) => ({
    cells: [],

    addCell: (type = 'sql') => set((s) => ({ cells: [...s.cells, makeCell({ type })] })),

    deleteCell: (id) => set((s) => ({ cells: s.cells.filter((c) => c.id !== id) })),

    // Unified update for both SQL and markdown source
    updateSource: (id, source) =>
        set((s) => ({ cells: s.cells.map((c) => (c.id === id ? { ...c, source } : c)) })),

    updateNamespace: (id, namespace) =>
        set((s) => ({ cells: s.cells.map((c) => (c.id === id ? { ...c, namespace } : c)) })),

    // Adds or replaces a single attachment on a markdown cell
    updateAttachment: (id, filename, meta) =>
        set((s) => ({
            cells: s.cells.map((c) => {
                if (c.id !== id) return c
                return { ...c, attachments: { ...(c.attachments ?? {}), [filename]: meta } }
            }),
        })),

    setRunning: (id) =>
        set((s) => ({
            cells: s.cells.map((c) =>
                c.id === id ? { ...c, status: 'running', results: null, error: null } : c
            ),
        })),

    setResults: (id, results) =>
        set((s) => ({
            cells: s.cells.map((c) => (c.id === id ? { ...c, status: 'done', results } : c)),
        })),

    setError: (id, error) =>
        set((s) => ({
            cells: s.cells.map((c) => (c.id === id ? { ...c, status: 'error', error } : c)),
        })),

    // Returns the v2-format serialisable snapshot (source as array of lines)
    getSnapshot: () =>
        get().cells.map((c) => {
            const cell = {
                id: c.id,
                type: c.type,
                source: sourceToLines(c.source),
                metadata: {},
            }
            if (c.namespace) cell.namespace = c.namespace
            if (c.attachments && Object.keys(c.attachments).length > 0) {
                cell.attachments = c.attachments
            }
            return cell
        }),

    // Loads cells from a v2 snapshot (or v1 for backward compat with existing drafts)
    loadSnapshot: (snapshots) => {
        const cells = snapshots.map((s) => {
            // v2: source is array-of-lines; v1: query/content are strings
            let source
            if (s.source !== undefined) {
                source = linesToSource(s.source)
            } else {
                source = s.type === 'markdown' ? (s.content ?? '') : (s.query ?? '')
            }
            return makeCell({
                id: typeof s.id === 'string' ? s.id : `c_${s.id}`,
                type: s.type ?? 'sql',
                source,
                namespace: s.namespace ?? null,
                attachments: s.attachments ?? null,
            })
        })
        set({ cells })
    },

    insertAfter: (afterId, type = 'sql') =>
        set((s) => {
            const idx = s.cells.findIndex((c) => c.id === afterId)
            if (idx === -1) return { cells: [...s.cells, makeCell({ type })] }
            const next = [...s.cells]
            next.splice(idx + 1, 0, makeCell({ type }))
            return { cells: next }
        }),

    moveUp: (id) =>
        set((s) => {
            const idx = s.cells.findIndex((c) => c.id === id)
            if (idx <= 0) return {}
            const next = [...s.cells]
            ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
            return { cells: next }
        }),

    moveDown: (id) =>
        set((s) => {
            const idx = s.cells.findIndex((c) => c.id === id)
            if (idx === -1 || idx >= s.cells.length - 1) return {}
            const next = [...s.cells]
            ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
            return { cells: next }
        }),

    clearCells: () => set({ cells: [] }),

    // Called once on app mount - restores cells + returns title and full notebook data
    initFromDraft: async () => {
        async function attemptFetch() {
            const res = await fetch('/draft')
            if (res.status === 204) return { title: null, notebookData: null }
            if (!res.ok) {
                console.warn('[draft] GET /draft returned', res.status, '- starting blank')
                return { title: null, notebookData: null }
            }
            const data = await res.json()
            if (Array.isArray(data.cells) && data.cells.length > 0) {
                get().loadSnapshot(data.cells)
            }
            const title = data.metadata?.title ?? data.title ?? null
            return { title, notebookData: data }
        }

        try {
            return await attemptFetch()
        } catch {
            try {
                await new Promise((r) => setTimeout(r, 900))
                return await attemptFetch()
            } catch (err) {
                console.warn('[draft] Could not reach backend for draft restore:', err.message)
                return { title: null, notebookData: null }
            }
        }
    },
}))

export default useCellStore
