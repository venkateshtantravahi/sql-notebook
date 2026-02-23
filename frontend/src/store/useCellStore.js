import { create } from 'zustand'

let nextId = 1

function makeCell() {
    return {
        id:        nextId++,
        query:     '',
        namespace: null,
        status:    'idle',   // idle | running | done | error
        results:   null,     // { columns: [], rows: [], rowCount, duration }
        error:     null,
    }
}

const useCellStore = create((set) => ({
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
}))

export default useCellStore