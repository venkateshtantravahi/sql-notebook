import {create} from "zustand";

const STORAGE_KEY = 'sql-notebook:query-history'
const MAX_ENTRIES = 200

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : []
    } catch { return  [] }
}

function saveToStorage(entries) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) }
    catch { console.warn('Failed to save query history') }
}

const useHistoryStore = create((set, get) => ({
    entries: loadFromStorage(),

    /**
     * Add a successful query execution to history
     * @param {string} query - the sql that was run
     * @param {string} namespace - the namespace it ran against
     * @param {number} rowCount - rows returned
     * @param {number} duration - execution time in ms
     */
    addEntry: (query, namespace, rowCount, duration) => {
        const entry = {
            id: crypto.randomUUID(),
            query: query.trim(),
            namespace,
            rowCount,
            duration,
            executedAt: new Date().toISOString(),
        }
        const entries = [entry, ...get().entries].slice(0, MAX_ENTRIES)
        saveToStorage(entries)
        set({ entries })
    },

    removeEntry: (id) => {
        const entries = get().entries.filter(e => e.id !== id)
        saveToStorage(entries)
        set({ entries })
    },

    clearHistory: () => {
        localStorage.removeItem(STORAGE_KEY)
        set({ entries: [] })
    },
}))

export default useHistoryStore