import { create } from 'zustand'

let nextId = 1

function makeCell(overrides = {}) {
    return {
        id: nextId++,
        type: 'sql', // 'sql' | 'markdown'
        query: '', // sql content (type === 'sql')
        content: '', // markdown content (type === 'markdown')
        namespace: null,
        status: 'idle', // idle | running | done | error
        results: null, // { columns: [], rows: [], rowCount, duration }
        error: null,
        ...overrides,
    }
}

const useCellStore = create((set, get) => ({
    cells: [],

    addCell: (type = 'sql') =>
        set((state) => ({
            cells: [...state.cells, makeCell({ type })],
        })),

    deleteCell: (id) =>
        set((state) => ({
            cells: state.cells.filter((c) => c.id !== id),
        })),

    updateQuery: (id, query) =>
        set((state) => ({
            cells: state.cells.map((c) => (c.id === id ? { ...c, query } : c)),
        })),

    updateContent: (id, content) =>
        set((state) => ({
            cells: state.cells.map((c) => (c.id === id ? { ...c, content } : c)),
        })),

    updateNamespace: (id, namespace) =>
        set((state) => ({
            cells: state.cells.map((c) => (c.id === id ? { ...c, namespace } : c)),
        })),

    setRunning: (id) =>
        set((state) => ({
            cells: state.cells.map((c) =>
                c.id === id ? { ...c, status: 'running', results: null, error: null } : c
            ),
        })),

    setResults: (id, results) =>
        set((state) => ({
            cells: state.cells.map((c) => (c.id === id ? { ...c, status: 'done', results } : c)),
        })),

    setError: (id, error) =>
        set((state) => ({
            cells: state.cells.map((c) => (c.id === id ? { ...c, status: 'error', error } : c)),
        })),

    // Returns a serialisable snapshot of current cells for notebook save
    getSnapshot: () => {
        return get().cells.map((c) => ({
            id: c.id,
            type: c.type,
            query: c.query,
            content: c.content,
            namespace: c.namespace,
        }))
    },

    // Loads cells from a saved snapshot — resets results/status
    loadSnapshot: (snapshots) => {
        const cells = snapshots.map((s) =>
            makeCell({
                id: s.id,
                type: s.type ?? 'sql',
                query: s.query ?? '',
                content: s.content ?? '',
                namespace: s.namespace ?? null,
            })
        )
        // Keep nextId above any loaded id to avoid collisions
        if (cells.length > 0) {
            nextId = Math.max(...cells.map((c) => c.id)) + 1
        }
        set({ cells })
    },

    insertAfter: (afterId, type = 'sql') =>
        set((state) => {
            const idx = state.cells.findIndex((c) => c.id === afterId)
            if (idx === -1) return { cells: [...state.cells, makeCell({ type })] }
            const next = [...state.cells]
            next.splice(idx + 1, 0, makeCell({ type }))
            return { cells: next }
        }),

    moveUp: (id) =>
        set((state) => {
            const idx = state.cells.findIndex((c) => c.id === id)
            if (idx <= 0) return {}
            const next = [...state.cells]
            ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
            return { cells: next }
        }),

    moveDown: (id) =>
        set((state) => {
            const idx = state.cells.findIndex((c) => c.id === id)
            if (idx === -1 || idx >= state.cells.length - 1) return {}
            const next = [...state.cells]
            ;[next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]
            return { cells: next }
        }),

    clearCells: () => set({ cells: [] }),

    // draft init
    // called once on app mount Fetches GET /draft from backend.
    // 200 -> cells + title into stores
    // 204 -> first launch, stay blank
    // error -> log and stay blank (never block app from starting)
    initFromDraft: async () => {
        try {
            const res = await fetch('/draft')

            if (res.status == 204) {
                return { title: null }
            }

            if (!res.ok) {
                console.warn('[draft] GET /draft returned', res.status, '-- starting blank')
                return { title: null }
            }

            const data = await res.json()

            if (Array.isArray(data.cells) && data.cells.length > 0) {
                get().loadSnapshot(data.cells)
            }

            return { title: data.title ?? null }
        } catch (error) {
            console.warn('[draft] Could not reach backend for draft restore:', error.message)
            return { title: null }
        }
    },
}))

export default useCellStore
