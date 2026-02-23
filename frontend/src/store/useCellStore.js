import { create } from 'zustand'

let nextId = 1

function makeCell(overrides = {}) {
    return {
        id:        nextId++,
        query:     '',
        namespace: null,
        status:    'idle',   // idle | running | done | error
        results:   null,     // { columns: [], rows: [], rowCount, duration }
        error:     null,
        ...overrides,
    }
}

const useCellStore = create((set, get) => ({
    cells: [],

    addCell: () => set(state => ({
        cells: [...state.cells, makeCell()]
    })),

    deleteCell: (id) => set(state => ({
        cells: state.cells.filter(c => c.id !== id)
    })),

    updateQuery: (id, query) => set(state => ({
        cells: state.cells.map(c => c.id === id ? { ...c, query } : c)
    })),

    updateNamespace: (id, namespace) => set(state => ({
        cells: state.cells.map(c => c.id === id ? { ...c, namespace } : c)
    })),

    setRunning: (id) => set(state => ({
        cells: state.cells.map(c =>
            c.id === id ? { ...c, status: 'running', results: null, error: null } : c
        )
    })),

    setResults: (id, results) => set(state => ({
        cells: state.cells.map(c =>
            c.id === id ? { ...c, status: 'done', results } : c
        )
    })),

    setError: (id, error) => set(state => ({
        cells: state.cells.map(c =>
            c.id === id ? { ...c, status: 'error', error } : c
        )
    })),

    // Returns a serialisable snapshot of current cells for notebook save
    getSnapshot: () => {
        return get().cells.map(c => ({
            id:        c.id,
            query:     c.query,
            namespace: c.namespace,
        }))
    },

    // Loads cells from a saved snapshot — resets results/status
    loadSnapshot: (snapshots) => {
        const cells = snapshots.map(s => makeCell({
            id:        s.id,
            query:     s.query,
            namespace: s.namespace,
        }))
        // Keep nextId above any loaded id to avoid collisions
        nextId = Math.max(...cells.map(c => c.id), nextId) + 1
        set({ cells })
    },

    clearCells: () => set({ cells: [] }),
}))

export default useCellStore